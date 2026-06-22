// Escalade des relances (Lot 6 — ADR 0025 §5, ADR 0019). Mode A (validation humaine).
//
// `genererBrouillonsRelances` (C2a) crée la PREMIÈRE relance (numero_dans_serie = 1) d'une
// échéance `imminente`/`en_retard` sans relance existante. Tant que le document n'arrive pas
// et que l'échéance reste en retard, il faut RELANCER À NOUVEAU — mais sans spammer, et avec
// un ARRÊT après N relances (politique d'escalade).
//
// Ce module gère la suite de la série : pour chaque échéance encore `en_retard` dont la
// DERNIÈRE relance a été ENVOYÉE il y a au moins `delaiEntreRelancesJours` jours (sans réponse),
// il crée un NOUVEAU brouillon `crm.relance` avec `numero_dans_serie = précédent + 1`, jusqu'à
// `maxRelances` inclus. Au-delà, l'escalade S'ARRÊTE (l'échéance reste en retard, traitée par le
// suivi humain / le risque). Mode A : on ne crée QUE des brouillons, jamais d'envoi automatique.
//
// Idempotence : on n'escalade pas s'il existe déjà un brouillon non envoyé pour l'échéance
// (la relance en cours doit être traitée d'abord), ni si la dernière relance est trop récente,
// ni si une réponse a été reçue (`reponse_recue_le`/`statut = 'repondue'`). Rejouable sans doublon.
//
// Clients en pause : exclus (comme C2a). Service role serveur, scope cabinet discipliné.

import { db, sql } from "@zarya/db";
import { type RelanceVariables, renderRelance } from "./render";

/** Politique d'escalade par défaut (MVP — à recalibrer côté founder). */
export const MAX_RELANCES_DEFAUT = 3;
export const DELAI_ENTRE_RELANCES_JOURS_DEFAUT = 7;

export interface EscaladeRelancesOptions {
  /** Limiter à un cabinet (défaut : tous — job système). */
  cabinetId?: string;
  /** Nombre maximal de relances dans la série (arrêt au-delà). Défaut 3. */
  maxRelances?: number;
  /** Délai minimal (jours) depuis la dernière relance envoyée avant d'escalader. Défaut 7. */
  delaiEntreRelancesJours?: number;
}

export interface EscaladeRelancesResult {
  /** Échéances candidates (en retard, dernière relance envoyée et mûre). */
  candidats: number;
  /** Nouveaux brouillons d'escalade créés. */
  brouillons_crees: number;
  /** Échéances ayant atteint la politique d'arrêt (numero_dans_serie >= maxRelances). */
  arretees_max: number;
  /** Candidats sans modèle de relance applicable. */
  sans_modele: number;
  /** Candidats sans destinataire (contact principal). */
  sans_destinataire: number;
}

// langue client (fr/de/it/en) → langue modèle (fr/de/it). 'en' → 'fr' par défaut.
function toModeleLangue(langue: string | null): "fr" | "de" | "it" {
  return langue === "de" || langue === "it" ? langue : "fr";
}

type EscaladeCandidate = {
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
  /** Plus haut numéro de série déjà atteint pour cette échéance (relance envoyée). */
  dernier_numero: number;
};

/**
 * Crée les brouillons d'escalade pour les échéances encore en retard dont la dernière relance
 * envoyée est mûre, dans la limite de `maxRelances`. Retourne un résumé. Aucun envoi (Mode A).
 */
export async function escaladerRelances(
  opts: EscaladeRelancesOptions = {},
): Promise<EscaladeRelancesResult> {
  const cabinetFilter = opts.cabinetId ?? null;
  const maxRelances = opts.maxRelances ?? MAX_RELANCES_DEFAUT;
  const delaiJours = opts.delaiEntreRelancesJours ?? DELAI_ENTRE_RELANCES_JOURS_DEFAUT;

  const result: EscaladeRelancesResult = {
    candidats: 0,
    brouillons_crees: 0,
    arretees_max: 0,
    sans_modele: 0,
    sans_destinataire: 0,
  };

  // Candidats : échéances en retard avec AU MOINS une relance ENVOYÉE, dont la plus récente
  // relance envoyée date d'au moins `delaiJours` jours, SANS brouillon en cours (la relance
  // précédente doit avoir été traitée) et SANS réponse reçue. Le dernier numéro de série sert
  // de base à l'incrément + au test de la politique d'arrêt. Clients en pause exclus.
  const candidates = await db.execute<EscaladeCandidate>(sql`
    SELECT
      e.id            AS echeance_id,
      e.cabinet_id    AS cabinet_id,
      e.client_id     AS client_id,
      e.type::text    AS type,
      e.libelle       AS libelle,
      to_char(e.date_echeance, 'YYYY-MM-DD') AS date_echeance,
      cl.raison_sociale  AS client_nom,
      cab.raison_sociale AS cabinet_nom,
      cl.langue::text AS client_langue,
      ct.id           AS contact_id,
      COALESCE(MAX(r.numero_dans_serie), 0) AS dernier_numero
    FROM crm.echeance e
    JOIN crm.client cl   ON cl.id = e.client_id
    JOIN crm.cabinet cab ON cab.id = e.cabinet_id
    LEFT JOIN crm.contact ct
      ON ct.client_id = e.client_id AND ct.est_principal AND ct.archived_at IS NULL
    JOIN crm.relance r
      ON r.echeance_id = e.id AND r.statut = 'envoyee'
    WHERE e.statut = 'en_retard'
      AND e.archived_at IS NULL
      AND (${cabinetFilter}::uuid IS NULL OR e.cabinet_id = ${cabinetFilter}::uuid)
      -- aucune réponse reçue sur la série (réponse = on arrête de relancer)
      AND NOT EXISTS (
        SELECT 1 FROM crm.relance rr
        WHERE rr.echeance_id = e.id
          AND (rr.statut = 'repondue' OR rr.reponse_recue_le IS NOT NULL)
      )
      -- pas de brouillon en cours (la relance précédente doit être traitée d'abord)
      AND NOT EXISTS (
        SELECT 1 FROM crm.relance rb
        WHERE rb.echeance_id = e.id AND rb.statut = 'brouillon'
      )
      -- client non en pause pour ce type d'échéance
      AND NOT EXISTS (
        SELECT 1 FROM calendar.pause_client p
        WHERE p.client_id = e.client_id AND p.actif
          AND CURRENT_DATE BETWEEN p.date_debut AND p.date_fin
          AND (p.types_echeances_paused IS NULL OR e.type::text = ANY(p.types_echeances_paused))
      )
    GROUP BY e.id, e.cabinet_id, e.client_id, e.type, e.libelle, e.date_echeance,
             cl.raison_sociale, cab.raison_sociale, cl.langue, ct.id
    -- dernière relance envoyée mûre (>= delaiJours jours)
    HAVING MAX(r.date_envoi) <= (CURRENT_TIMESTAMP - (${delaiJours} || ' days')::interval)
  `);

  result.candidats = candidates.length;

  for (const c of candidates) {
    const prochain = c.dernier_numero + 1;
    // Politique d'arrêt : on ne dépasse pas maxRelances.
    if (prochain > maxRelances) {
      result.arretees_max++;
      continue;
    }

    const langue = toModeleLangue(c.client_langue);
    // Modèle d'escalade : on privilégie un modèle dédié au rang (numero_relance = prochain),
    // sinon on retombe sur le modèle générique (numero_relance IS NULL) puis le n°1.
    const [modele] = await db.execute<{ objet: string; corps: string }>(sql`
      SELECT objet, corps FROM calendar.modele_relance
      WHERE type_echeance = ${c.type}::crm.type_echeance
        AND langue = ${langue}::calendar.langue
        AND actif = true
        AND (numero_relance = ${prochain} OR numero_relance IS NULL OR numero_relance = 1)
        AND (cabinet_id = ${c.cabinet_id}::uuid OR cabinet_id IS NULL)
      ORDER BY (cabinet_id IS NOT NULL) DESC,
               (numero_relance = ${prochain}) DESC,
               (numero_relance IS NULL) DESC
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
        ${c.contact_id}::uuid, ${rendu.objet}, ${rendu.corps}, 'brouillon', ${prochain}
      )
    `);
    result.brouillons_crees++;
  }

  return result;
}
