// Renouvellement des subscriptions Graph (Bloc D4c). Job système (toutes les cabinets),
// déclenché par un Vercel Cron quotidien. pg_cron ne peut PAS le faire : chaque PATCH
// /subscriptions exige un appel Graph avec le token du cabinet (TS, pas SQL).
// Dépendances injectables → testable sans réseau ni DB.

import { MicrosoftGraphClient } from "./client";
import {
  type ExpiringSubscription,
  listExpiringSubscriptions,
  markSubscriptionError,
  updateSubscriptionExpiration,
} from "./email-store";
import { MicrosoftGraphError } from "./errors";

// Même TTL qu'à la création (~70 h, sous la limite Microsoft de ~4230 min).
const SUBSCRIPTION_TTL_MS = 70 * 60 * 60 * 1000;
// Fenêtre de renouvellement : on prolonge les subscriptions expirant sous 24 h (le cron
// tourne quotidiennement → marge confortable avant l'expiration réelle à 72 h).
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SubscriptionRenewer {
  renewSubscription(
    subscriptionId: string,
    expirationDateTime: string,
  ): Promise<{ id: string; expirationDateTime: string }>;
}

export interface RenewSubscriptionsOptions {
  list?: (before: Date) => Promise<ExpiringSubscription[]>;
  makeClient?: (cabinet_id: string) => SubscriptionRenewer;
  persistRenewed?: (id: string, expiration: Date) => Promise<void>;
  persistError?: (id: string, erreur: string, statut: "erreur" | "revoquee") => Promise<void>;
  now?: () => number;
  windowMs?: number;
}

export interface RenewSubscriptionsResult {
  total: number;
  renewed: number;
  failed: number;
}

/**
 * Renouvelle toutes les subscriptions actives proches de l'expiration. Best-effort par
 * subscription : un échec n'interrompt pas le lot (marqué erreur/révoquée et compté).
 */
export async function renewExpiringSubscriptions(
  opts: RenewSubscriptionsOptions = {},
): Promise<RenewSubscriptionsResult> {
  const now = opts.now ?? Date.now;
  const list = opts.list ?? listExpiringSubscriptions;
  const persistRenewed = opts.persistRenewed ?? updateSubscriptionExpiration;
  const persistError = opts.persistError ?? markSubscriptionError;
  const makeClient = opts.makeClient ?? ((id: string) => new MicrosoftGraphClient(id));
  const windowMs = opts.windowMs ?? RENEWAL_WINDOW_MS;

  const before = new Date(now() + windowMs);
  const subs = await list(before);

  let renewed = 0;
  let failed = 0;
  for (const sub of subs) {
    try {
      const newExpiration = new Date(now() + SUBSCRIPTION_TTL_MS).toISOString();
      const res = await makeClient(sub.cabinet_id).renewSubscription(
        sub.subscription_id,
        newExpiration,
      );
      await persistRenewed(sub.id, new Date(res.expirationDateTime));
      renewed++;
    } catch (err) {
      // 'revoked' (token mort) → la subscription est perdue : on la marque révoquée.
      const revoked = err instanceof MicrosoftGraphError && err.code === "revoked";
      const message = err instanceof Error ? err.message : "inconnu";
      await persistError(sub.id, message, revoked ? "revoquee" : "erreur");
      failed++;
    }
  }
  return { total: subs.length, renewed, failed };
}
