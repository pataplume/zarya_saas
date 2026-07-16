"use server";

import { createSupabaseAdminClient, requireAuth } from "@zarya/auth";
import { db, invitationMembre, sessionOnboardingFiduciaire } from "@zarya/db";
import { logger } from "@zarya/logger";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { messageErreurInvitation } from "@/lib/invitation-erreurs";

const MembreSchema = z.object({
  email: z.string().email("Email invalide"),
  prenom: z.string().min(1, "Prénom requis"),
  nom: z.string().min(1, "Nom requis"),
  role: z.enum(["responsable", "gestionnaire_salaires", "collaborateur", "lecteur"], {
    errorMap: () => ({ message: "Rôle invalide" }),
  }),
});

const InvitationsSchema = z.object({
  membres: z.array(MembreSchema),
});

export type InvitationsState = {
  error?: string;
  rowErrors?: Array<{ index: number; message: string }>;
};

export async function inviterMembresAction(
  _prev: InvitationsState,
  formData: FormData,
): Promise<InvitationsState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  // Extraire les membres depuis les champs indexés (membre_0_email, etc.)
  const membres: Array<{
    email: string;
    prenom: string;
    nom: string;
    role: string;
  }> = [];

  let i = 0;
  while (formData.has(`membre_${i}_email`)) {
    membres.push({
      email: String(formData.get(`membre_${i}_email`) ?? ""),
      prenom: String(formData.get(`membre_${i}_prenom`) ?? ""),
      nom: String(formData.get(`membre_${i}_nom`) ?? ""),
      role: String(formData.get(`membre_${i}_role`) ?? "collaborateur"),
    });
    i++;
  }

  // Valider
  const parsed = InvitationsSchema.safeParse({ membres });
  if (!parsed.success) {
    const rowErrors = parsed.error.issues.map((issue) => ({
      index: Number(issue.path[1] ?? 0),
      message: issue.message,
    }));
    return { rowErrors };
  }

  // Récupérer la session onboarding pour lier les invitations
  const [session] = await db
    .select({ id: sessionOnboardingFiduciaire.id })
    .from(sessionOnboardingFiduciaire)
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id))
    .limit(1);

  const admin = createSupabaseAdminClient();
  const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
  const rowErrors: Array<{ index: number; message: string }> = [];

  for (const [index, membre] of parsed.data.membres.entries()) {
    // Idempotence : une invitation encore en attente pour cet email n'est ni dupliquée
    // ni renvoyée — permet de re-soumettre le formulaire après une erreur partielle.
    const [dejaInvitee] = await db
      .select({ id: invitationMembre.id })
      .from(invitationMembre)
      .where(
        and(
          eq(invitationMembre.cabinet_id, cabinet_id),
          eq(invitationMembre.email, membre.email),
          inArray(invitationMembre.statut, ["envoyee", "lue"]),
        ),
      )
      .limit(1);
    if (dejaInvitee) continue;

    // Créer le record d'invitation en DB
    const [invitationCreee] = await db
      .insert(invitationMembre)
      .values({
        cabinet_id,
        session_id: session?.id ?? null,
        email: membre.email,
        prenom: membre.prenom,
        nom: membre.nom,
        role_propose: membre.role as
          | "responsable"
          | "gestionnaire_salaires"
          | "collaborateur"
          | "lecteur",
        envoyee_par: user.id,
        token_expire_at: expireAt,
      })
      .returning({ id: invitationMembre.id });

    // Envoyer l'invitation via Supabase (magic link)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { error: erreurEnvoi } = await admin.auth.admin.inviteUserByEmail(membre.email, {
      redirectTo: `${appUrl}/auth/callback`,
      data: {
        cabinet_id,
        role: membre.role,
        prenom: membre.prenom,
        nom: membre.nom,
      },
    });

    if (erreurEnvoi) {
      // Cohérence : pas de ligne « envoyée » si l'email n'est pas parti → rollback.
      if (invitationCreee) {
        await db.delete(invitationMembre).where(eq(invitationMembre.id, invitationCreee.id));
      }
      logger.error(
        {
          cabinet_id,
          index,
          code: erreurEnvoi.code,
          status: erreurEnvoi.status,
          error: erreurEnvoi.message,
        },
        "[onboarding.equipe] échec envoi invitation Supabase",
      );
      rowErrors.push({ index, message: messageErreurInvitation(erreurEnvoi) });
    }
  }

  if (rowErrors.length > 0) {
    return {
      error:
        "Certaines invitations n'ont pas pu être envoyées. Corrigez les lignes en erreur puis réessayez — les invitations déjà envoyées ne seront pas dupliquées.",
      rowErrors,
    };
  }

  // Marquer l'étape B comme terminée
  await db
    .update(sessionOnboardingFiduciaire)
    .set({
      statut: "etape_b_terminee",
      etape_b_terminee_at: new Date(),
      date_derniere_activite: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id));

  redirect("/onboarding/import");
}

// Skip étape B (cabinet solo)
export async function passerEquipeAction(_prev: unknown, _formData: FormData) {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return;

  await db
    .update(sessionOnboardingFiduciaire)
    .set({
      statut: "etape_b_terminee",
      etape_b_terminee_at: new Date(),
      date_derniere_activite: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id));

  redirect("/onboarding/import");
}
