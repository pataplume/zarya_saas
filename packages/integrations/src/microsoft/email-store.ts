// Persistance de l'ingestion email Microsoft Graph (Bloc D4b) — tables doc.email_*.
// Service role serveur uniquement (jamais côté client navigateur).

import { and, db, emailBrut, emailSubscription, eq, isNull } from "@zarya/db";

export interface SaveSubscriptionInput {
  cabinet_id: string;
  subscription_id: string;
  resource: string;
  change_type: string;
  client_state_secret: string;
  expiration_at: Date;
}

/** Enregistre une subscription Graph nouvellement créée. */
export async function saveEmailSubscription(input: SaveSubscriptionInput): Promise<void> {
  await db.insert(emailSubscription).values({
    cabinet_id: input.cabinet_id,
    subscription_id: input.subscription_id,
    resource: input.resource,
    change_type: input.change_type,
    client_state_secret: input.client_state_secret,
    expiration_at: input.expiration_at,
    statut: "active",
  });
}

export interface SubscriptionLookup {
  id: string;
  cabinet_id: string;
  client_state_secret: string;
}

/** Retrouve une subscription active par son id Graph (pour authentifier une notif). */
export async function findSubscriptionByGraphId(
  subscriptionId: string,
): Promise<SubscriptionLookup | null> {
  const rows = await db
    .select({
      id: emailSubscription.id,
      cabinet_id: emailSubscription.cabinet_id,
      client_state_secret: emailSubscription.client_state_secret,
    })
    .from(emailSubscription)
    .where(
      and(
        eq(emailSubscription.subscription_id, subscriptionId),
        isNull(emailSubscription.archived_at),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertEmailBrutInput {
  cabinet_id: string;
  message_id: string;
  subscription_id?: string | null;
  internet_message_id?: string | null;
  subject?: string | null;
  from_address?: string | null;
  from_name?: string | null;
  received_at?: Date | null;
  has_attachments?: boolean;
  body_preview?: string | null;
  web_link?: string | null;
}

/**
 * Insère un email_brut, idempotent sur (cabinet_id, message_id). Retourne true si une
 * ligne a été créée, false si le message était déjà ingéré (notification rejouée).
 */
export async function upsertEmailBrut(input: UpsertEmailBrutInput): Promise<boolean> {
  const rows = await db
    .insert(emailBrut)
    .values({
      cabinet_id: input.cabinet_id,
      message_id: input.message_id,
      subscription_id: input.subscription_id ?? null,
      internet_message_id: input.internet_message_id ?? null,
      subject: input.subject ?? null,
      from_address: input.from_address ?? null,
      from_name: input.from_name ?? null,
      received_at: input.received_at ?? null,
      has_attachments: input.has_attachments ?? false,
      body_preview: input.body_preview ?? null,
      web_link: input.web_link ?? null,
      statut: "recu",
    })
    .onConflictDoNothing({ target: [emailBrut.cabinet_id, emailBrut.message_id] })
    .returning({ id: emailBrut.id });
  return rows.length > 0;
}
