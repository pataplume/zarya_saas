"use server";

import { createSupabaseAdminClient, requireAuth } from "@zarya/auth";
import { accesClient, client as clientTable, contact, db } from "@zarya/db";
import { logger } from "@zarya/logger";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { messageErreurInvitation } from "@/lib/invitation-erreurs";

// Création d'un accès contact RH client (mini-dashboard) — Bloc F1 (onboarding-client §auth).
// Le CABINET crée le compte ; le contact reçoit un email d'invitation Supabase et active son
// compte (1re connexion = pose du mot de passe). Le rôle `client_contact` + `client_id` sont
// posés en app_metadata (server-controlled, JAMAIS user_metadata éditable) → frontière de
// sécurité du mini-dashboard (le contact ne voit QUE son client).
//
// Anti-fuite : on re-vérifie que le client ET le contact appartiennent au cabinet de l'acteur.
// L'envoi d'email passe par Supabase Auth (inviteUserByEmail) — arbitré founder (MVP, pas de
// couplage Microsoft Graph). En test, `@zarya/auth` (dont createSupabaseAdminClient) est mocké.

const ROLES_GESTION_CLIENT = new Set(["responsable", "collaborateur"]);
const PATH = "/app/clients";

export type AccesClientActionState = { error?: string; success?: boolean };

const Schema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: z.enum(["rh", "dirigeant", "admin"]).default("rh"),
});

export async function creerAccesClientAction(
  _prev: AccesClientActionState,
  formData: FormData,
): Promise<AccesClientActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!ROLES_GESTION_CLIENT.has(role)) return { error: "Droits insuffisants." };

  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const { client_id, contact_id, role: roleClient } = parsed.data;

  // Scope : le client appartient au cabinet ?
  const [cli] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  // Le contact appartient bien à ce client/cabinet ?
  const [ct] = await db
    .select({ id: contact.id, email: contact.email })
    .from(contact)
    .where(
      and(
        eq(contact.id, contact_id),
        eq(contact.cabinet_id, cabinet_id),
        eq(contact.client_id, client_id),
      ),
    )
    .limit(1);
  if (!ct) return { error: "Contact introuvable pour ce client." };
  if (!ct.email) return { error: "Le contact n'a pas d'email." };

  // Déjà un accès actif ?
  const [deja] = await db
    .select({ id: accesClient.id })
    .from(accesClient)
    .where(
      and(
        eq(accesClient.cabinet_id, cabinet_id),
        eq(accesClient.contact_id, contact_id),
        isNull(accesClient.archived_at),
      ),
    )
    .limit(1);
  if (deja) return { error: "Un accès existe déjà pour ce contact." };

  // 1. Invitation Supabase (crée le user + envoie l'email d'activation).
  const admin = createSupabaseAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ct.email, {
    redirectTo: `${appUrl}/auth/callback`,
  });
  if (error || !data.user) {
    logger.error(
      { cabinet_id, client_id, code: error?.code, status: error?.status, error: error?.message },
      "[acces-client] échec envoi invitation Supabase",
    );
    return { error: messageErreurInvitation(error) };
  }
  const authUserId = data.user.id;

  // 2. app_metadata SERVER-CONTROLLED (sécurité : jamais user_metadata) : rôle + scope client.
  const { error: majErr } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: { role: "client_contact", client_id, cabinet_id },
  });
  if (majErr) {
    logger.error(
      { cabinet_id, client_id, code: majErr.code, status: majErr.status, error: majErr.message },
      "[acces-client] échec configuration app_metadata du compte invité",
    );
    return { error: "Échec de la configuration du compte." };
  }

  // 3. Persistance : acces_client + marque le contact comme contact RH.
  await db.insert(accesClient).values({
    cabinet_id,
    client_id,
    contact_id,
    auth_user_id: authUserId,
    email: ct.email,
    role: roleClient,
    created_by: user.id,
  });
  await db
    .update(contact)
    .set({ est_contact_rh: true })
    .where(and(eq(contact.id, contact_id), eq(contact.cabinet_id, cabinet_id)));

  revalidatePath(PATH);
  return { success: true };
}
