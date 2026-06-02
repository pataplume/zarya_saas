// Maintenance des échéances (Bloc C4) : fait progresser les statuts (transition SQL
// Run 3) puis recalcule le risque des clients ayant des échéances en retard. Job système
// (toutes cabinets, service role), déclenché par Vercel Cron. La pg_cron horaire (0007)
// transitionne déjà les statuts ; ce job ajoute le recalcul de risque (TS, computeScoreRisque
// B5) que pg_cron ne peut pas faire. Re-exécuter la transition ici est idempotent.

import { db, sql } from "@zarya/db";
import { recalculerRisqueClient } from "@zarya/extraction";

export interface MajEcheancesResult {
  passees_imminente: number;
  passees_en_retard: number;
  clients_risque_recalcule: number;
}

export interface MajEcheancesOptions {
  /** Recalcul de risque par client (défaut : recalculerRisqueClient — B5). Injectable. */
  recalc?: (cabinet_id: string, client_id: string) => Promise<unknown>;
}

export async function majEcheancesEtRisque(
  opts: MajEcheancesOptions = {},
): Promise<MajEcheancesResult> {
  const recalc = opts.recalc ?? recalculerRisqueClient;

  const [tr] = await db.execute<{ passees_imminente: number; passees_en_retard: number }>(
    sql`SELECT passees_imminente, passees_en_retard FROM calendar.fn_transition_statuts_echeances()`,
  );

  // Clients ayant au moins une échéance en retard ouverte → risque potentiellement périmé.
  const clients = await db.execute<{ cabinet_id: string; client_id: string }>(sql`
    SELECT DISTINCT cabinet_id, client_id
    FROM crm.echeance
    WHERE statut = 'en_retard' AND archived_at IS NULL
  `);
  for (const c of clients) {
    await recalc(c.cabinet_id, c.client_id);
  }

  return {
    passees_imminente: tr?.passees_imminente ?? 0,
    passees_en_retard: tr?.passees_en_retard ?? 0,
    clients_risque_recalcule: clients.length,
  };
}
