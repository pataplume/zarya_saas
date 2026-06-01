// Helpers d'écriture des journaux d'audit (security-and-audit.md §8).
// Append-only : ces helpers n'exposent QUE l'insertion (jamais update/delete — bloqués
// en DB par REVOKE + trigger, migration 0025). Tourne en service role serveur : à ne
// JAMAIS appeler depuis du code client navigateur.

import { db } from "./client";
import { apiExterne } from "./schema";

// Une entrée du journal des appels API tierces (audit.api_externe).
// `metadata` = contexte NON sensible uniquement (nb items, tentatives, retry_after) —
// jamais de token, corps de message, ni donnée client en clair (CLAUDE.md §2).
export interface ApiExterneAuditEntry {
  cabinet_id: string;
  provider: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  ok: boolean;
  latency_ms: number;
  error_code?: string | null;
  acteur_type?: string | null;
  acteur_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insère une ligne dans audit.api_externe. Best-effort par convention d'appel : le
 * wrapper appelant ne doit pas faire échouer une opération métier réussie si l'audit
 * échoue (il catch et logue) — mais on NE swallow PAS ici, pour rester testable.
 */
export async function recordApiExterne(entry: ApiExterneAuditEntry): Promise<void> {
  await db.insert(apiExterne).values({
    cabinet_id: entry.cabinet_id,
    provider: entry.provider,
    endpoint: entry.endpoint,
    method: entry.method,
    status_code: entry.status_code,
    ok: entry.ok,
    error_code: entry.error_code ?? null,
    latency_ms: entry.latency_ms,
    acteur_type: entry.acteur_type ?? null,
    acteur_id: entry.acteur_id ?? null,
    metadata: entry.metadata ?? {},
  });
}
