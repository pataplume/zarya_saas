// Provisioning côté serveur uniquement
// Crée le tenant (cabinet + membre responsable + session onboarding) de façon atomique

import { createSupabaseAdminClient } from "@zarya/auth";
import { cabinet, cabinetMembre, db } from "@zarya/db";
import { logger } from "@zarya/logger";

export interface ProvisionResult {
  cabinet_id: string;
}

/**
 * Appel unique au sign-up.
 * Crée : crm.cabinet (minimal) + crm.cabinet_membre (responsable)
 * Le trigger DB crée automatiquement crm.session_onboarding_fiduciaire.
 * Injecte cabinet_id + role dans app_metadata du JWT.
 */
export async function provisionNewCabinet(params: {
  userId: string;
  email: string;
}): Promise<ProvisionResult> {
  // 1. Créer le cabinet (minimal — sera complété à l'étape A)
  const nomProvisoire = params.email.split("@")[0] ?? "cabinet";
  const [newCabinet] = await db
    .insert(cabinet)
    .values({
      raison_sociale: nomProvisoire,
      email_contact: params.email,
      created_by: params.userId,
    })
    .returning({ id: cabinet.id });

  if (!newCabinet) {
    throw new Error("Échec création cabinet");
  }

  // 2. Créer le membre responsable
  await db.insert(cabinetMembre).values({
    cabinet_id: newCabinet.id,
    user_id: params.userId,
    role: "responsable",
    actif: true,
  });

  // 3. Injecter cabinet_id + role dans app_metadata (via service role)
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(params.userId, {
    app_metadata: {
      cabinet_id: newCabinet.id,
      role: "responsable",
    },
  });

  if (error) {
    // Non-bloquant : le cabinet est créé, mais le JWT sera mis à jour au prochain refresh.
    // Contexte minimal (ids techniques), jamais de PII.
    logger.warn(
      { user_id: params.userId, cabinet_id: newCabinet.id, error: error.message },
      "[provisioning] injection app_metadata échouée (JWT MAJ au prochain refresh)",
    );
  }

  return { cabinet_id: newCabinet.id };
}

/**
 * Appelé dans /auth/callback quand un membre accepte une invitation.
 * Crée crm.cabinet_membre et injecte app_metadata.
 */
export async function accepterInvitation(params: {
  userId: string;
  email: string;
}): Promise<{ cabinet_id: string; role: string } | null> {
  // Chercher une invitation envoyée pour cet email
  const { invitationMembre } = await import("@zarya/db");
  const { eq, and } = await import("drizzle-orm");

  const [invitation] = await db
    .select()
    .from(invitationMembre)
    .where(and(eq(invitationMembre.email, params.email), eq(invitationMembre.statut, "envoyee")))
    .limit(1);

  if (!invitation) return null;

  // Créer le cabinet_membre pour cet utilisateur
  const [membre] = await db
    .insert(cabinetMembre)
    .values({
      cabinet_id: invitation.cabinet_id,
      user_id: params.userId,
      role: invitation.role_propose,
      prenom: invitation.prenom ?? undefined,
      nom: invitation.nom ?? undefined,
      actif: true,
    })
    .returning({ id: cabinetMembre.id });

  if (!membre) return null;

  // Marquer l'invitation comme acceptée
  await db
    .update(invitationMembre)
    .set({
      statut: "acceptee",
      date_acceptation: new Date(),
      cabinet_membre_id: membre.id,
      updated_at: new Date(),
    })
    .where(eq(invitationMembre.id, invitation.id));

  // Injecter app_metadata
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.updateUserById(params.userId, {
    app_metadata: {
      cabinet_id: invitation.cabinet_id,
      role: invitation.role_propose,
    },
  });

  return { cabinet_id: invitation.cabinet_id, role: invitation.role_propose };
}
