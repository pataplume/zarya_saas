// Orchestration de l'ingestion email Microsoft Graph (Bloc D4b).
//  • createEmailSubscription : crée l'abonnement Graph (à la connexion) + le persiste.
//  • ingestEmailNotification : à la réception d'une notif, authentifie via le secret,
//    re-fetch le message et l'écrit dans doc.email_brut (idempotent). PAS de classif live.
// Dépendances (client Graph, persistance, secret) injectables → testable sans réseau ni DB.

import { randomUUID } from "node:crypto";
import { MicrosoftGraphClient } from "./client";
import {
  findSubscriptionByGraphId,
  type SubscriptionLookup,
  saveEmailSubscription,
  type UpsertEmailBrutInput,
  upsertEmailBrut,
} from "./email-store";
import { MicrosoftGraphError } from "./errors";
import type { EmailDetail } from "./graph-types";

const INBOX_RESOURCE = "/me/mailFolders('Inbox')/messages";
const CHANGE_TYPE = "created";
// Microsoft limite les subscriptions messages à ~4230 min (~70.5 h). On vise 70 h.
const SUBSCRIPTION_TTL_MS = 70 * 60 * 60 * 1000;

function webhookUrl(explicit?: string): string {
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new MicrosoftGraphError(
      "config_missing",
      "NEXT_PUBLIC_APP_URL requis pour l'URL de notification webhook.",
    );
  }
  return `${base.replace(/\/$/, "")}/api/integrations/microsoft/webhook`;
}

interface SubscriptionCreator {
  createSubscription(params: {
    changeType: string;
    notificationUrl: string;
    resource: string;
    expirationDateTime: string;
    clientState: string;
  }): Promise<{ id: string; expirationDateTime: string }>;
}

export interface CreateEmailSubscriptionOptions {
  client?: SubscriptionCreator;
  persist?: (input: Parameters<typeof saveEmailSubscription>[0]) => Promise<void>;
  generateSecret?: () => string;
  notificationUrl?: string;
  now?: () => number;
}

export interface EmailSubscriptionResult {
  subscriptionId: string;
  expirationAt: string;
}

/** Crée l'abonnement Graph (Inbox) d'un cabinet et le persiste. */
export async function createEmailSubscription(
  cabinet_id: string,
  opts: CreateEmailSubscriptionOptions = {},
): Promise<EmailSubscriptionResult> {
  const client = opts.client ?? new MicrosoftGraphClient(cabinet_id);
  const persist = opts.persist ?? saveEmailSubscription;
  const secret = (opts.generateSecret ?? randomUUID)();
  const now = opts.now ?? Date.now;

  const expirationDateTime = new Date(now() + SUBSCRIPTION_TTL_MS).toISOString();
  const created = await client.createSubscription({
    changeType: CHANGE_TYPE,
    notificationUrl: webhookUrl(opts.notificationUrl),
    resource: INBOX_RESOURCE,
    expirationDateTime,
    clientState: secret,
  });

  await persist({
    cabinet_id,
    subscription_id: created.id,
    resource: INBOX_RESOURCE,
    change_type: CHANGE_TYPE,
    client_state_secret: secret,
    expiration_at: new Date(created.expirationDateTime),
  });
  return { subscriptionId: created.id, expirationAt: created.expirationDateTime };
}

// ─── Réception des notifications ────────────────────────────────────────────────

export interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  resourceData?: { id?: string } | null;
}

export type IngestStatus =
  | "ingested"
  | "duplicate"
  | "unauthorized"
  | "unknown_subscription"
  | "invalid";

interface MessageFetcher {
  getEmail(id: string): Promise<EmailDetail>;
}

export interface IngestNotificationOptions {
  findSubscription?: (subscriptionId: string) => Promise<SubscriptionLookup | null>;
  makeClient?: (cabinet_id: string) => MessageFetcher;
  persist?: (input: UpsertEmailBrutInput) => Promise<boolean>;
}

/** Parse le corps d'un webhook Graph en notifications exploitables. PUR. */
export function parseGraphNotifications(body: unknown): GraphNotification[] {
  if (!body || typeof body !== "object") return [];
  const value = (body as { value?: unknown }).value;
  return Array.isArray(value) ? (value as GraphNotification[]) : [];
}

/**
 * Ingestion d'UNE notification : authentifie via le secret stocké, re-fetch le message,
 * écrit dans email_brut (idempotent). Ne lève pas pour un secret invalide (retourne un
 * statut) — le endpoint répond 202 quoi qu'il arrive pour éviter les rejeux Microsoft.
 */
export async function ingestEmailNotification(
  notif: GraphNotification,
  opts: IngestNotificationOptions = {},
): Promise<IngestStatus> {
  const subscriptionId = notif.subscriptionId;
  const messageId = notif.resourceData?.id;
  if (!subscriptionId || !messageId) return "invalid";

  const find = opts.findSubscription ?? findSubscriptionByGraphId;
  const sub = await find(subscriptionId);
  if (!sub) return "unknown_subscription";
  // Authentification : le clientState renvoyé DOIT matcher le secret stocké.
  if (notif.clientState !== sub.client_state_secret) return "unauthorized";

  const makeClient = opts.makeClient ?? ((id: string) => new MicrosoftGraphClient(id));
  const persist = opts.persist ?? upsertEmailBrut;
  const msg = await makeClient(sub.cabinet_id).getEmail(messageId);

  const inserted = await persist({
    cabinet_id: sub.cabinet_id,
    message_id: messageId,
    subscription_id: subscriptionId,
    subject: msg.subject,
    from_address: msg.from,
    from_name: null,
    received_at: msg.receivedDateTime ? new Date(msg.receivedDateTime) : null,
    has_attachments: msg.hasAttachments,
    body_preview: msg.bodyPreview,
  });
  return inserted ? "ingested" : "duplicate";
}
