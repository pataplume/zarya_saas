// Alerte ops générique — POST JSON vers un webhook (Slack/Make/ntfy…) via
// OPS_ALERT_WEBHOOK_URL (AUDIT-MVP.md §8 P0-1 ; CLAUDE.md §Errors : 401/403 API
// tierce → alerte ops critique).
//
// Garanties :
//  - no-op silencieux si OPS_ALERT_WEBHOOK_URL absente (dev/local sans webhook) ;
//  - ne throw JAMAIS : une alerte qui échoue ne doit pas casser le chemin métier
//    appelant (déjà en situation d'erreur) — échec loggué en pino ;
//  - timeout 5 s via AbortController (pas d'appel externe sans timeout).
//
// ⚠️ PII : ne JAMAIS mettre d'IBAN, AVS, token, nom de client ou contenu de
// document dans `subject`/`context` — ids techniques et codes d'erreur seulement.

import { logger } from "./index";

const OPS_ALERT_TIMEOUT_MS = 5_000;

/** Envoie {subject, context, timestamp} au webhook ops. Fire-and-forget sûr (ne throw jamais). */
export async function sendOpsAlert(
  subject: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, OPS_ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        context: context ?? {},
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn({ status: response.status, subject }, "[ops-alert] webhook a répondu non-2xx");
    }
  } catch (err) {
    logger.warn(
      { subject, error: err instanceof Error ? err.message : "inconnu" },
      "[ops-alert] envoi de l'alerte échoué",
    );
  } finally {
    clearTimeout(timer);
  }
}
