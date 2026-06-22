// Lot 4 (ADR 0025) — Données du dossier client pour les documents attendus + relances.
//
// Sécurité : `db` service role BYPASSE la RLS (ADR 0005 addendum). La frontière réelle est
// le filtre (cabinet_id, client_id) discipliné dans chaque requête. Chaque lecteur renvoie
// une liste vide / null si le client n'appartient pas au cabinet. Aucune colonne sensible.

import { MAX_RELANCES_DEFAUT } from "@zarya/calendar";
import { db, sql } from "@zarya/db";

export type DocumentAttenduRow = {
  id: string;
  service_id: string | null;
  service_type: string | null;
  type_document: string;
  categorie: string | null;
  frequence: string;
  obligatoire: boolean;
  deadline_jours_apres_periode: number | null;
  statut_periode_courante: string | null;
  derniere_reception: string | null;
};

/** Documents attendus actifs d'un client (+ type du service rattaché). Scopé cabinet. */
export async function getDocumentsAttendus(
  cabinetId: string,
  clientId: string,
): Promise<DocumentAttenduRow[]> {
  const rows = await db.execute<DocumentAttenduRow>(sql`
    SELECT
      da.id,
      da.service_id,
      s.type::text AS service_type,
      da.type_document,
      da.categorie::text AS categorie,
      da.frequence::text AS frequence,
      da.obligatoire,
      da.deadline_jours_apres_periode,
      da.statut_periode_courante::text AS statut_periode_courante,
      to_char(da.derniere_reception, 'YYYY-MM-DD') AS derniere_reception
    FROM crm.document_attendu da
    LEFT JOIN crm.service s ON s.id = da.service_id
    WHERE da.cabinet_id = ${cabinetId}::uuid
      AND da.client_id = ${clientId}::uuid
      AND da.archived_at IS NULL
    ORDER BY da.obligatoire DESC, da.type_document ASC
  `);
  return rows;
}

export type RelanceTimelineRow = {
  id: string;
  statut: string;
  canal: string;
  sujet: string | null;
  destinataire_nom: string | null;
  destinataire_email: string | null;
  echeance_libelle: string | null;
  document_libelle: string | null;
  numero_dans_serie: number | null;
  date_envoi: string | null;
  reponse_recue_le: string | null;
  created_at: string;
};

/** Timeline des relances d'un client (log : brouillons + envoyées), récentes d'abord. */
export async function getRelancesTimeline(
  cabinetId: string,
  clientId: string,
  limit = 100,
): Promise<RelanceTimelineRow[]> {
  const rows = await db.execute<RelanceTimelineRow>(sql`
    SELECT
      r.id,
      r.statut::text AS statut,
      r.canal::text AS canal,
      r.sujet,
      NULLIF(trim(coalesce(ct.prenom, '') || ' ' || coalesce(ct.nom, '')), '') AS destinataire_nom,
      ct.email AS destinataire_email,
      e.libelle AS echeance_libelle,
      da.type_document AS document_libelle,
      r.numero_dans_serie,
      to_char(r.date_envoi, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS date_envoi,
      to_char(r.reponse_recue_le, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS reponse_recue_le,
      to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
    FROM crm.relance r
    LEFT JOIN crm.contact ct ON ct.id = r.destinataire_contact_id
    LEFT JOIN crm.echeance e ON e.id = r.echeance_id
    LEFT JOIN crm.document_attendu da ON da.id = r.document_attendu_id
    WHERE r.cabinet_id = ${cabinetId}::uuid
      AND r.client_id = ${clientId}::uuid
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `);
  return rows;
}

/** Politique d'arrêt d'escalade surfacée à l'UI (Lot 6). */
export const MAX_RELANCES = MAX_RELANCES_DEFAUT;

export type RelanceAVenirRow = {
  /** Présent si un brouillon a déjà été généré (cron) pour cette échéance. */
  relance_id: string | null;
  echeance_id: string;
  type: string;
  libelle: string;
  date_echeance: string;
  statut: string;
  /** Lot 6 — plus haut numéro de relance ENVOYÉE dans la série (0 = aucune envoyée). */
  relances_envoyees: number;
  /** Lot 6 — prochain numéro de la série (relances_envoyees + 1), pour affichage. */
  prochain_numero: number;
  /** Lot 6 — true si la politique d'arrêt (N relances) est atteinte : plus d'escalade auto. */
  escalade_max_atteinte: boolean;
};

/**
 * « Relances à venir » d'un client : échéances `imminente`/`en_retard` non traitées, avec le
 * brouillon de relance déjà généré (cron) s'il existe. Exclut un client actuellement en pause.
 *
 * Lot 6 : surface le compteur de série (`relances_envoyees` / `prochain_numero`) et le flag
 * d'arrêt d'escalade (`escalade_max_atteinte`) pour rendre la politique visible côté fiduciaire.
 */
export async function getRelancesAVenir(
  cabinetId: string,
  clientId: string,
): Promise<RelanceAVenirRow[]> {
  const rows = await db.execute<RelanceAVenirRow>(sql`
    SELECT
      r.id            AS relance_id,
      e.id            AS echeance_id,
      e.type::text    AS type,
      e.libelle       AS libelle,
      to_char(e.date_echeance, 'YYYY-MM-DD') AS date_echeance,
      e.statut::text  AS statut,
      COALESCE(envoyees.n, 0)::int AS relances_envoyees,
      (COALESCE(envoyees.n, 0) + 1)::int AS prochain_numero,
      (COALESCE(envoyees.n, 0) >= ${MAX_RELANCES_DEFAUT}) AS escalade_max_atteinte
    FROM crm.echeance e
    LEFT JOIN crm.relance r
      ON r.echeance_id = e.id AND r.statut = 'brouillon'
    LEFT JOIN LATERAL (
      SELECT MAX(re.numero_dans_serie) AS n
      FROM crm.relance re
      WHERE re.echeance_id = e.id AND re.statut = 'envoyee'
    ) envoyees ON true
    WHERE e.cabinet_id = ${cabinetId}::uuid
      AND e.client_id = ${clientId}::uuid
      AND e.statut IN ('imminente', 'en_retard')
      AND e.archived_at IS NULL
    ORDER BY e.date_echeance ASC
  `);
  return rows;
}

export type PauseActiveRow = {
  id: string;
  date_debut: string;
  date_fin: string;
  motif: string | null;
};

/** Pause de relances actuellement active pour un client (CURRENT_DATE dans la fenêtre). */
export async function getPauseActive(
  cabinetId: string,
  clientId: string,
): Promise<PauseActiveRow | null> {
  const [row] = await db.execute<PauseActiveRow>(sql`
    SELECT
      id,
      to_char(date_debut, 'YYYY-MM-DD') AS date_debut,
      to_char(date_fin, 'YYYY-MM-DD') AS date_fin,
      motif
    FROM calendar.pause_client
    WHERE cabinet_id = ${cabinetId}::uuid
      AND client_id = ${clientId}::uuid
      AND actif
      AND CURRENT_DATE BETWEEN date_debut AND date_fin
    ORDER BY date_fin DESC
    LIMIT 1
  `);
  return row ?? null;
}
