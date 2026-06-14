"use server";

// Run I1 — demande de suppression d'accès côté CLIENT (espace). N'effectue PAS de
// suppression : enregistre la demande (crm.demande_suppression cible='client') routée vers
// le cabinet, qui est responsable du traitement (droits-personnes.md §3.2). Le client_id et
// le cabinet_id viennent du contexte serveur (app_metadata), jamais du corps de requête.
//
// C5.2 — édition de profil côté espace client (mot de passe + nom affiché). Passe par
// `createSupabaseServerClient().auth.updateUser()` (Supabase gère le hash + la session) ;
// aucun mot de passe n'est journalisé. L'identité (cabinet_id, client_id) reste portée par
// l'app_metadata server-controlled : ces actions ne touchent QUE l'utilisateur courant.
import { createSupabaseServerClient } from "@zarya/auth";
import { db, demandeSuppression } from "@zarya/db";
import { logger } from "@zarya/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEspaceClientContext } from "@/lib/espace-context";

const ESPACE_PARAMS_PATH = "/espace/parametres";

const schema = z.object({ motif: z.string().trim().max(2000).optional() });

export type SuppressionClientState = { error?: string; success?: boolean };

export async function demanderSuppressionClientAction(
  _prev: SuppressionClientState,
  formData: FormData,
): Promise<SuppressionClientState> {
  const { cabinet_id, client_id, user_id, email } = await getEspaceClientContext();

  const parsed = schema.safeParse({ motif: formData.get("motif") || undefined });
  if (!parsed.success) return { error: "Formulaire invalide." };

  await db.insert(demandeSuppression).values({
    cabinet_id,
    cible: "client",
    client_id,
    demandeur_user_id: user_id,
    demandeur_email: email,
    motif: parsed.data.motif ?? null,
  });

  revalidatePath(ESPACE_PARAMS_PATH);
  return { success: true };
}

// ─── C5.2 — Profil éditable ───────────────────────────────────────────────────

export type ProfilClientState = { error?: string; success?: string };

const NomSchema = z.object({
  display_name: z.string().trim().min(1, "Le nom ne peut pas être vide.").max(120),
});

/** Met à jour le nom affiché (user_metadata.display_name) de l'utilisateur courant. */
export async function modifierNomAfficheAction(
  _prev: ProfilClientState,
  formData: FormData,
): Promise<ProfilClientState> {
  // Verrouille l'action au contexte client_contact (redirige sinon) — défense en profondeur.
  await getEspaceClientContext();

  const parsed = NomSchema.safeParse({ display_name: formData.get("display_name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nom invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    data: { display_name: parsed.data.display_name },
  });
  if (error) {
    logger.error({ code: error.code }, "[espace.profil] échec mise à jour nom affiché");
    return { error: "Impossible de mettre à jour le nom pour le moment." };
  }

  revalidatePath(ESPACE_PARAMS_PATH);
  return { success: "Votre nom a été mis à jour." };
}

const MotDePasseSchema = z
  .object({
    nouveau: z.string().min(8, "Le mot de passe doit comporter au moins 8 caractères.").max(200),
    confirmation: z.string(),
  })
  .refine((d) => d.nouveau === d.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

/** Change le mot de passe de l'utilisateur courant. Aucun mot de passe n'est journalisé. */
export async function modifierMotDePasseAction(
  _prev: ProfilClientState,
  formData: FormData,
): Promise<ProfilClientState> {
  await getEspaceClientContext();

  const parsed = MotDePasseSchema.safeParse({
    nouveau: formData.get("nouveau"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  }

  const supabase = await createSupabaseServerClient();
  // On ne logue jamais la valeur : Supabase gère le hash, on ne manipule pas le clair ailleurs.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.nouveau });
  if (error) {
    logger.error({ code: error.code }, "[espace.profil] échec changement de mot de passe");
    return { error: "Impossible de changer le mot de passe pour le moment." };
  }

  return { success: "Votre mot de passe a été modifié." };
}

const EmailSchema = z.object({ email: z.string().trim().email("Adresse e-mail invalide.") });

/**
 * Change l'adresse e-mail de connexion. Supabase déclenche un flux de confirmation
 * (e-mail de vérification) : l'adresse n'est effective qu'après confirmation par l'utilisateur.
 */
export async function modifierEmailAction(
  _prev: ProfilClientState,
  formData: FormData,
): Promise<ProfilClientState> {
  await getEspaceClientContext();

  const parsed = EmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
  if (error) {
    logger.error({ code: error.code }, "[espace.profil] échec changement d'adresse e-mail");
    return { error: "Impossible de changer l'adresse e-mail pour le moment." };
  }

  return {
    success:
      "Un e-mail de confirmation a été envoyé à la nouvelle adresse. Le changement sera effectif après confirmation.",
  };
}
