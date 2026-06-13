// C3.1 — Digest « à traiter » du dashboard cabinet (/app).
// Helper de lecture testable, scopé STRICTEMENT par cabinet_id.
//
// Sécurité (CRITIQUE) : le `db` applicatif se connecte en service role et BYPASSE
// la RLS (ADR 0005 addendum). La frontière de sécurité réelle sur le chemin app
// repose donc ENTIÈREMENT sur le filtre `cabinet_id` discipliné dans CHAQUE requête
// — jamais une valeur issue d'URL/body. Toutes les vues réutilisées (doc.v_inbox_a_valider,
// crm.v_echeances_a_venir, calendar.v_relances_a_valider, salaire.v_periode_fiduciaire)
// exposent `cabinet_id` précisément pour ce filtre.
//
// Aucune colonne ultra-sensible n'est projetée ici : on ne renvoie que des compteurs.

import {
  db,
  echeance,
  propositionFacture,
  sql,
  vEcheancesAVenir,
  vInboxAValider,
  vRelancesAValider,
} from "@zarya/db";
import { and, count, eq, isNull } from "drizzle-orm";

export interface DigestCabinet {
  /** Propositions de classement de documents en attente de validation (doc.v_inbox_a_valider). */
  documents_a_valider: number;
  /** Propositions de facture en attente de validation (facture.proposition_facture, statut a_valider). */
  factures_a_valider: number;
  /** Échéances ouvertes échues (crm.echeance, statut en_retard). */
  echeances_en_retard: number;
  /** Échéances ouvertes à venir dans les 30 prochains jours (crm.v_echeances_a_venir). */
  echeances_a_venir: number;
  /** Relances en brouillon à valider/envoyer (calendar.v_relances_a_valider). */
  relances_a_valider: number;
  /** Périodes salaire encore à traiter (à valider ou en retard) — salaire.v_periode_fiduciaire. */
  periodes_salaire_a_traiter: number;
}

function premier(rows: { n: number }[]): number {
  return rows[0]?.n ?? 0;
}

/**
 * Compteurs « à traiter » à l'échelle du cabinet, tous scopés cabinet_id.
 * Exécutés en parallèle (Promise.all). Chaque requête refiltre `cabinet_id`
 * (défense en profondeur sur le chemin service-role).
 */
export async function getDigestCabinet(cabinet_id: string): Promise<DigestCabinet> {
  const [
    documentsRows,
    facturesRows,
    echeancesRetardRows,
    echeancesAVenirRows,
    relancesRows,
    salaireRows,
  ] = await Promise.all([
    // Documents à valider — file d'inbox dénormalisée (Bloc B7).
    db.select({ n: count() }).from(vInboxAValider).where(eq(vInboxAValider.cabinet_id, cabinet_id)),
    // Factures à valider — propositions en attente (statut a_valider).
    db
      .select({ n: count() })
      .from(propositionFacture)
      .where(
        and(
          eq(propositionFacture.cabinet_id, cabinet_id),
          eq(propositionFacture.statut, "a_valider"),
        ),
      ),
    // Échéances en retard — ouvertes et échues (la vue v_echeances_a_venir ne
    // couvre que les ≤ 30 prochains jours, pas le passé).
    db
      .select({ n: count() })
      .from(echeance)
      .where(
        and(
          eq(echeance.cabinet_id, cabinet_id),
          eq(echeance.statut, "en_retard"),
          isNull(echeance.archived_at),
        ),
      ),
    // Échéances à venir — fenêtre des 30 prochains jours (vue dédiée, scopée cabinet).
    db
      .select({ n: count() })
      .from(vEcheancesAVenir)
      .where(eq(vEcheancesAVenir.cabinet_id, cabinet_id)),
    // Relances à valider — brouillons proposés (Mode A : l'humain valide puis envoie).
    db
      .select({ n: count() })
      .from(vRelancesAValider)
      .where(eq(vRelancesAValider.cabinet_id, cabinet_id)),
    // Périodes salaire à traiter — à valider (non_demandee/en_attente/relancee) ou en retard.
    db.execute(sql`
      SELECT count(*)::int AS n
      FROM salaire.v_periode_fiduciaire
      WHERE cabinet_id = ${cabinet_id}
        AND statut IN ('non_demandee', 'en_attente', 'relancee', 'en_retard')
    `) as unknown as Promise<Array<{ n: number }>>,
  ]);

  return {
    documents_a_valider: premier(documentsRows),
    factures_a_valider: premier(facturesRows),
    echeances_en_retard: premier(echeancesRetardRows),
    echeances_a_venir: premier(echeancesAVenirRows),
    relances_a_valider: premier(relancesRows),
    periodes_salaire_a_traiter: Number(salaireRows[0]?.n ?? 0),
  };
}
