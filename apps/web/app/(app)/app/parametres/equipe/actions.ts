"use server";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, requireAuth } from "@zarya/auth";
import { cabinetMembre, db, evenement, invitationMembre } from "@zarya/db";
import { logger } from "@zarya/logger";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { messageErreurInvitation } from "@/lib/invitation-erreurs";

const ROLES = ["responsable", "gestionnaire_salaires", "collaborateur", "lecteur"] as const;
type Role = (typeof ROLES)[number];

const RoleSchema = z.enum(ROLES, { errorMap: () => ({ message: "Rôle invalide" }) });

const DUREE_VALIDITE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// ─── Inviter un membre ────────────────────────────────────────────────────────

const InviterSchema = z.object({
  email: z.string().email("Email invalide"),
  prenom: z.string().min(1, "Prénom requis"),
  nom: z.string().min(1, "Nom requis"),
  role: RoleSchema,
});

export type InviterState = { error?: string; success?: boolean };

export async function inviterMembreAction(
  _prev: InviterState,
  formData: FormData,
): Promise<InviterState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  // Seul le responsable peut inviter
  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return { error: "Action réservée au responsable" };

  const parsed = InviterSchema.safeParse({
    email: formData.get("email"),
    prenom: formData.get("prenom"),
    nom: formData.get("nom"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const { email, prenom, nom, role: rolePropose } = parsed.data;
  const expireAt = new Date(Date.now() + DUREE_VALIDITE_INVITATION_MS);

  const [invitationCreee] = await db
    .insert(invitationMembre)
    .values({
      cabinet_id,
      email,
      prenom,
      nom,
      role_propose: rolePropose,
      envoyee_par: user.id,
      token_expire_at: expireAt,
    })
    .returning({ id: invitationMembre.id });

  const admin = createSupabaseAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error: erreurEnvoi } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback`,
    data: { cabinet_id, role: rolePropose, prenom, nom },
  });

  if (erreurEnvoi) {
    // Cohérence : pas de ligne « envoyée » si l'email n'est pas parti → rollback.
    if (invitationCreee) {
      await db
        .delete(invitationMembre)
        .where(
          and(
            eq(invitationMembre.id, invitationCreee.id),
            eq(invitationMembre.cabinet_id, cabinet_id),
          ),
        );
    }
    logger.error(
      {
        cabinet_id,
        code: erreurEnvoi.code,
        status: erreurEnvoi.status,
        error: erreurEnvoi.message,
      },
      "[parametres.equipe] échec envoi invitation Supabase",
    );
    return { error: messageErreurInvitation(erreurEnvoi, { renvoiDisponible: true }) };
  }

  revalidatePath("/app/parametres/equipe");
  return { success: true };
}

// ─── Changer le rôle d'un membre ─────────────────────────────────────────────

export async function changerRoleAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return;

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return;

  const membre_id = String(formData.get("membre_id") ?? "");
  const nouveau_role = formData.get("role");

  const parsedRole = RoleSchema.safeParse(nouveau_role);
  if (!parsedRole.success || !membre_id) return;

  // Vérifier qu'on ne retire pas le dernier responsable
  if (parsedRole.data !== "responsable") {
    const responsables = await db
      .select({ id: cabinetMembre.id })
      .from(cabinetMembre)
      .where(
        and(
          eq(cabinetMembre.cabinet_id, cabinet_id),
          eq(cabinetMembre.role, "responsable"),
          eq(cabinetMembre.actif, true),
          isNull(cabinetMembre.archived_at),
        ),
      );
    const cibleEstResponsable =
      (await db
        .select({ role: cabinetMembre.role })
        .from(cabinetMembre)
        .where(and(eq(cabinetMembre.id, membre_id), eq(cabinetMembre.cabinet_id, cabinet_id)))
        .limit(1)
        .then((r) => r[0]?.role)) === "responsable";

    if (cibleEstResponsable && responsables.length <= 1) return; // impossible — dernier responsable
  }

  await db
    .update(cabinetMembre)
    .set({ role: parsedRole.data as Role, updated_at: new Date() })
    .where(and(eq(cabinetMembre.id, membre_id), eq(cabinetMembre.cabinet_id, cabinet_id)));

  revalidatePath("/app/parametres/equipe");
}

// ─── Révoquer un membre ───────────────────────────────────────────────────────

export async function revoquerMembreAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return;

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return;

  const membre_id = String(formData.get("membre_id") ?? "");
  if (!membre_id) return;

  // Pas d'auto-révocation
  const [cible] = await db
    .select({ user_id: cabinetMembre.user_id, role: cabinetMembre.role })
    .from(cabinetMembre)
    .where(and(eq(cabinetMembre.id, membre_id), eq(cabinetMembre.cabinet_id, cabinet_id)))
    .limit(1);

  if (!cible || cible.user_id === user.id) return;

  // Pas de révocation du dernier responsable
  if (cible.role === "responsable") {
    const responsables = await db
      .select({ id: cabinetMembre.id })
      .from(cabinetMembre)
      .where(
        and(
          eq(cabinetMembre.cabinet_id, cabinet_id),
          eq(cabinetMembre.role, "responsable"),
          eq(cabinetMembre.actif, true),
          isNull(cabinetMembre.archived_at),
        ),
      );
    if (responsables.length <= 1) return;
  }

  await db
    .update(cabinetMembre)
    .set({ actif: false, archived_at: new Date(), updated_at: new Date() })
    .where(and(eq(cabinetMembre.id, membre_id), eq(cabinetMembre.cabinet_id, cabinet_id)));

  revalidatePath("/app/parametres/equipe");
}

// ─── Annuler une invitation ───────────────────────────────────────────────────

export async function annulerInvitationAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return;

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return;

  const invitation_id = String(formData.get("invitation_id") ?? "");
  if (!invitation_id) return;

  await db
    .update(invitationMembre)
    .set({ statut: "annulee", updated_at: new Date() })
    .where(
      and(eq(invitationMembre.id, invitation_id), eq(invitationMembre.cabinet_id, cabinet_id)),
    );

  revalidatePath("/app/parametres/equipe");
}

// ─── Renvoyer une invitation (token expiré ou email jamais reçu) ─────────────

export type RenvoyerInvitationState = { error?: string; success?: boolean };

export async function renvoyerInvitationAction(
  invitationId: string,
): Promise<RenvoyerInvitationState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  // Seul le responsable peut gérer les invitations (cohérent avec inviter/annuler)
  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return { error: "Action réservée au responsable" };

  if (!invitationId) return { error: "Invitation introuvable" };

  const [invitation] = await db
    .select({
      id: invitationMembre.id,
      email: invitationMembre.email,
      role_propose: invitationMembre.role_propose,
      prenom: invitationMembre.prenom,
      nom: invitationMembre.nom,
      statut: invitationMembre.statut,
    })
    .from(invitationMembre)
    .where(and(eq(invitationMembre.id, invitationId), eq(invitationMembre.cabinet_id, cabinet_id)))
    .limit(1);

  if (!invitation) return { error: "Invitation introuvable" };
  // Une invitation déjà acceptée/refusée/annulée ne se renvoie pas.
  if (invitation.statut !== "envoyee" && invitation.statut !== "lue") {
    return { error: "Cette invitation n'est plus en attente" };
  }

  // Envoi d'abord : on ne rafraîchit le token/date_envoi que si l'email est réellement parti.
  const admin = createSupabaseAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error: erreurEnvoi } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo: `${appUrl}/auth/callback`,
    data: {
      cabinet_id,
      role: invitation.role_propose,
      prenom: invitation.prenom,
      nom: invitation.nom,
    },
  });

  if (erreurEnvoi) {
    logger.error(
      {
        cabinet_id,
        invitation_id: invitationId,
        code: erreurEnvoi.code,
        status: erreurEnvoi.status,
        error: erreurEnvoi.message,
      },
      "[parametres.equipe] échec renvoi invitation Supabase",
    );
    return { error: messageErreurInvitation(erreurEnvoi) };
  }

  const nouveauToken = randomUUID();
  const expireAt = new Date(Date.now() + DUREE_VALIDITE_INVITATION_MS);

  await db
    .update(invitationMembre)
    .set({
      token: nouveauToken,
      token_expire_at: expireAt,
      statut: "envoyee",
      date_envoi: new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(invitationMembre.id, invitationId), eq(invitationMembre.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: null,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.invitation_membre",
    ressource_id: invitationId,
    description: "Invitation équipe renvoyée",
    metadata: { role_propose: invitation.role_propose },
  });

  revalidatePath("/app/parametres/equipe");
  return { success: true };
}
