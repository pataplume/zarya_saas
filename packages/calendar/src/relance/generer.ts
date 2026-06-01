// Génération des brouillons de relance (Bloc C2a, Mode A). Job système quotidien
// (Vercel Cron) : scanne les échéances dues, rend le contenu via renderRelance, crée
// des relances en statut 'brouillon' prêtes à valider. PAS d'envoi (Mode A = validation
// humaine, l'envoi est C2b). Idempotent : une échéance ayant déjà une relance est ignorée.
//
// Service role serveur (toutes cabinets ou un cabinet ciblé). Jamais côté client.

import { db, sql } from "@zarya/db";
import { type RelanceVariables, renderRelance } from "./render";

// langue client (fr/de/it/en) → langue modèle (fr/de/it). 'en' → 'fr' par défaut.
function toModeleLangue(langue: string | null): "fr" | "de" | "it" {
  return langue === "de" || langue === "it" ? langue : "fr";
}

type EcheanceCandidate = {
  echeance_id: string;
  cabinet_id: string;
  client_id: string;
  type: string;
  libelle: string;
  date_echeance: string;
  client_nom: string;
  cabinet_nom: string;
  client_langue: string | null;
  contact_id: string | null;
};

export interface GenererRelancesResult {
  candidats: number;
  brouillons_crees: number;
  sans_modele: number;
  sans_destinataire: number;
}

export interface GenererRelancesOptions {
  /** Limiter à un cabinet (défaut : tous — job système). */
  cabinetId?: string;
}

/**
 * Crée les brouillons de relance pour les échéances `imminente`/`en_retard` sans relance
 * existante, hors clients en pause. Retourne un résumé.
 */
export async function genererBrouillonsRelances(
  opts: GenererRelancesOptions = {},
): Promise<GenererRelancesResult> {
  const cabinetFilter = opts.cabinetId ?? null;

  const candidates = await db.execute<EcheanceCandidate>(sql`
    SELECT
      e.id            AS echeance_id,
      e.cabinet_id    AS cabinet_id,
      e.client_id     AS client_id,
      e.type::text    AS type,
      e.libelle       AS libelle,
      to_char(e.date_echeance, 'YYYY-MM-DD') AS date_echeance,
      cl.raison_sociale AS client_nom,
      cab.raison_sociale AS cabinet_nom,
      cl.langue::text AS client_langue,
      ct.id           AS contact_id
    FROM crm.echeance e
    JOIN crm.client cl  ON cl.id = e.client_id
    JOIN crm.cabinet cab ON cab.id = e.cabinet_id
    LEFT JOIN crm.contact ct
      ON ct.client_id = e.client_id AND ct.est_principal AND ct.archived_at IS NULL
    WHERE e.statut IN ('imminente', 'en_retard')
      AND e.archived_at IS NULL
      AND (${cabinetFilter}::uuid IS NULL OR e.cabinet_id = ${cabinetFilter}::uuid)
      AND NOT EXISTS (SELECT 1 FROM crm.relance r WHERE r.echeance_id = e.id)
      AND NOT EXISTS (
        SELECT 1 FROM calendar.pause_client p
        WHERE p.client_id = e.client_id AND p.actif
          AND CURRENT_DATE BETWEEN p.date_debut AND p.date_fin
          AND (p.types_echeances_paused IS NULL OR e.type::text = ANY(p.types_echeances_paused))
      )
  `);

  const result: GenererRelancesResult = {
    candidats: candidates.length,
    brouillons_crees: 0,
    sans_modele: 0,
    sans_destinataire: 0,
  };

  for (const c of candidates) {
    const langue = toModeleLangue(c.client_langue);
    const [modele] = await db.execute<{ objet: string; corps: string }>(sql`
      SELECT objet, corps FROM calendar.modele_relance
      WHERE type_echeance = ${c.type}::crm.type_echeance
        AND langue = ${langue}::calendar.langue
        AND actif = true
        AND (numero_relance = 1 OR numero_relance IS NULL)
        AND (cabinet_id = ${c.cabinet_id}::uuid OR cabinet_id IS NULL)
      ORDER BY (cabinet_id IS NOT NULL) DESC, (numero_relance = 1) DESC
      LIMIT 1
    `);

    if (!modele) {
      result.sans_modele++;
      continue;
    }
    if (!c.contact_id) result.sans_destinataire++;

    const vars: RelanceVariables = {
      client_nom: c.client_nom,
      echeance_libelle: c.libelle,
      date_echeance: c.date_echeance,
      responsable_nom: c.cabinet_nom,
      cabinet_nom: c.cabinet_nom,
    };
    const rendu = renderRelance({ objet: modele.objet, corps: modele.corps }, vars);

    await db.execute(sql`
      INSERT INTO crm.relance
        (cabinet_id, client_id, echeance_id, canal, destinataire_contact_id, sujet, corps,
         statut, numero_dans_serie)
      VALUES (
        ${c.cabinet_id}::uuid, ${c.client_id}::uuid, ${c.echeance_id}::uuid, 'email',
        ${c.contact_id}::uuid, ${rendu.objet}, ${rendu.corps}, 'brouillon', 1
      )
    `);
    result.brouillons_crees++;
  }

  return result;
}
