// Cron « horizon » des échéances (Lot 6 — ADR 0025, achèvement ADR 0011 Run 6).
//
// La génération initiale (`genererEcheancesPourClient`, Lot 2) est déclenchée à
// l'activation/maj d'un service et matérialise les occurrences de l'horizon [today,
// today+12 mois]. À mesure que le temps passe et que les périodes se clôturent, de
// NOUVELLES occurrences entrent dans l'horizon : ce cron quotidien les matérialise pour
// TOUS les clients actifs, en réutilisant exactement `genererEcheancesPourClient` (donc
// la même sémantique de dates et la MÊME idempotence : clé (client_id, template_id,
// date_echeance) non archivé). Rejouer le job ne crée jamais de doublon.
//
// Job système (service role serveur, toutes cabinets ou un cabinet ciblé). Jamais côté
// client. La frontière multi-tenant reste le filtre (cabinet_id, client_id) discipliné :
// on itère les clients en lisant leur cabinet_id réel, et `genererEcheancesPourClient`
// re-vérifie l'appartenance (anti-fuite, ADR 0005 addendum).

import { db, sql } from "@zarya/db";
import { type GenererEcheancesResult, genererEcheancesPourClient } from "./generer";

export interface RoulerHorizonOptions {
  /** Restreint à un cabinet (défaut : tous — job système). */
  cabinetId?: string;
  /** Horizon de génération en mois (défaut 12, comme la génération initiale). */
  horizonMois?: number;
  /** Date de référence `YYYY-MM-DD` (défaut : aujourd'hui UTC) — injectable pour les tests. */
  today?: string;
}

export interface RoulerHorizonResult {
  /** Clients actifs parcourus. */
  clients_traites: number;
  /** Échéances effectivement insérées sur l'ensemble des clients (hors doublons idempotents). */
  echeances_creees: number;
  /** Clients pour lesquels au moins une nouvelle échéance a été créée. */
  clients_avec_nouvelles_echeances: number;
}

type ClientRow = { cabinet_id: string; client_id: string };

/**
 * Roule l'horizon des échéances pour tous les clients actifs (idempotent).
 *
 * Pour chaque client non archivé (filtré par cabinet si `cabinetId` fourni), appelle
 * `genererEcheancesPourClient` : les occurrences déjà matérialisées sont ignorées (clé
 * idempotente), seules les nouvelles entrant dans l'horizon roulant sont insérées.
 */
export async function roulerHorizonEcheances(
  opts: RoulerHorizonOptions = {},
): Promise<RoulerHorizonResult> {
  const cabinetFilter = opts.cabinetId ?? null;

  const clients = await db.execute<ClientRow>(sql`
    SELECT c.cabinet_id AS cabinet_id, c.id AS client_id
    FROM crm.client c
    WHERE c.archived_at IS NULL
      AND (${cabinetFilter}::uuid IS NULL OR c.cabinet_id = ${cabinetFilter}::uuid)
    ORDER BY c.cabinet_id, c.id
  `);

  const result: RoulerHorizonResult = {
    clients_traites: 0,
    echeances_creees: 0,
    clients_avec_nouvelles_echeances: 0,
  };

  for (const c of clients) {
    const genOpts: Parameters<typeof genererEcheancesPourClient>[2] = {};
    if (opts.horizonMois !== undefined) genOpts.horizonMois = opts.horizonMois;
    if (opts.today !== undefined) genOpts.today = opts.today;

    const r: GenererEcheancesResult = await genererEcheancesPourClient(
      c.cabinet_id,
      c.client_id,
      genOpts,
    );
    result.clients_traites++;
    result.echeances_creees += r.echeances_creees;
    if (r.echeances_creees > 0) result.clients_avec_nouvelles_echeances++;
  }

  return result;
}
