// Heartbeat des crons Vercel (P0-1 observabilité, AUDIT-MVP.md §8).
// Pattern healthchecks.io : GET ${CRON_HEARTBEAT_URL}/${slug} en fin de run OK,
// GET ${CRON_HEARTBEAT_URL}/${slug}/fail en cas d'échec. Le service alerte si un
// ping attendu n'arrive pas (cron silencieusement mort) ou si /fail est reçu.
//
// Garanties : no-op silencieux sans CRON_HEARTBEAT_URL ; ne throw JAMAIS (un ping
// raté ne doit pas faire échouer le cron) ; timeout 5 s. Serveur uniquement.

import { logger } from "@zarya/logger";

const HEARTBEAT_TIMEOUT_MS = 5_000;

/** Ping fire-and-forget du check heartbeat d'un cron. `ok=false` → endpoint /fail. */
export async function pingCronHeartbeat(slug: string, ok: boolean): Promise<void> {
  const base = process.env.CRON_HEARTBEAT_URL;
  if (!base) return;

  const url = `${base.replace(/\/+$/, "")}/${slug}${ok ? "" : "/fail"}`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, HEARTBEAT_TIMEOUT_MS);

  try {
    await fetch(url, { method: "GET", signal: controller.signal });
  } catch (err) {
    logger.warn(
      { slug, ok, error: err instanceof Error ? err.message : "inconnu" },
      "[cron.heartbeat] ping heartbeat échoué",
    );
  } finally {
    clearTimeout(timer);
  }
}
