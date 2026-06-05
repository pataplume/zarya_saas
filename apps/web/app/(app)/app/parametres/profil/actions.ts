"use server";

import { createSupabaseServerClient, requireAuth } from "@zarya/auth";
import { cabinetMembre, db } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── Mettre à jour prénom / nom ───────────────────────────────────────────────

const ProfilSchema = z.object({
  prenom: z.string().min(1, "Prénom requis").max(100),
  nom: z.string().min(1, "Nom requis").max(100),
  telephone: z.string().trim().max(40).optional(),
  signatureEmail: z.string().trim().max(2000).optional(),
});

export type ProfilState = { error?: string; success?: boolean };

export async function mettreAJourProfilAction(
  _prev: ProfilState,
  formData: FormData,
): Promise<ProfilState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const parsed = ProfilSchema.safeParse({
    prenom: formData.get("prenom"),
    nom: formData.get("nom"),
    telephone: formData.get("telephone") || undefined,
    signatureEmail: formData.get("signatureEmail") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  await db
    .update(cabinetMembre)
    .set({
      prenom: parsed.data.prenom,
      nom: parsed.data.nom,
      telephone: parsed.data.telephone ?? null,
      signature_email: parsed.data.signatureEmail ?? null,
      updated_at: new Date(),
    })
    .where(and(eq(cabinetMembre.user_id, user.id), eq(cabinetMembre.cabinet_id, cabinet_id)));

  revalidatePath("/app/parametres/profil");
  return { success: true };
}

// ─── Changer le mot de passe ──────────────────────────────────────────────────

const MotDePasseSchema = z
  .object({
    nouveau: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
    confirmation: z.string().min(1, "Confirmation requise"),
  })
  .refine((d) => d.nouveau === d.confirmation, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmation"],
  });

export type MotDePasseState = { error?: string; success?: boolean };

export async function changerMotDePasseAction(
  _prev: MotDePasseState,
  formData: FormData,
): Promise<MotDePasseState> {
  // requireAuth vérifie la session mais on utilise le client SSR pour updateUser
  await requireAuth();

  const parsed = MotDePasseSchema.safeParse({
    nouveau: formData.get("nouveau"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  // updateUser avec le client SSR (session cookie) — pas le client admin
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.nouveau });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
