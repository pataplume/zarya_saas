// G4a — Lecture du pilotage salaire côté fiduciaire (flow E §5-6 / salaire.md §6).
// Toujours scopé cabinet_id. Vue salaire.v_periode_fiduciaire (migration 0038). Lecture seule.

import { db, sql } from "@zarya/db";

export interface PeriodeFiduciaire {
  id: string;
  client_id: string;
  raison_sociale: string;
  annee: number;
  mois: number;
  statut: string;
  date_limite_validation: string;
  nb_employes_concernes: number;
  nb_changements_declares: number;
  nb_pieces: number;
  validee: boolean;
  derniere_modification_par: string | null;
}

function mapRow(r: Record<string, unknown>): PeriodeFiduciaire {
  return {
    id: r.id as string,
    client_id: r.client_id as string,
    raison_sociale: r.raison_sociale as string,
    annee: Number(r.annee),
    mois: Number(r.mois),
    statut: r.statut as string,
    date_limite_validation: String(r.date_limite_validation),
    nb_employes_concernes: Number(r.nb_employes_concernes ?? 0),
    nb_changements_declares: Number(r.nb_changements_declares ?? 0),
    nb_pieces: Number(r.nb_pieces ?? 0),
    validee: Boolean(r.validee),
    derniere_modification_par: (r.derniere_modification_par as string | null) ?? null,
  };
}

/** Périodes d'un mois donné (tableau par client), scopées cabinet. */
export async function getPeriodesFiduciaire(
  cabinet_id: string,
  annee: number,
  mois: number,
): Promise<PeriodeFiduciaire[]> {
  const rows = (await db.execute(sql`
    SELECT id, client_id, raison_sociale, annee, mois, statut,
           date_limite_validation::text AS date_limite_validation,
           nb_employes_concernes, nb_changements_declares, nb_pieces, validee,
           derniere_modification_par
    FROM salaire.v_periode_fiduciaire
    WHERE cabinet_id = ${cabinet_id} AND annee = ${annee} AND mois = ${mois}
    ORDER BY raison_sociale
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export interface KpisFiduciaire {
  total: number;
  validees: number;
  a_valider: number;
  en_retard: number;
  exportees: number;
}

/** KPIs agrégés d'un mois (compteurs par statut), scopés cabinet. */
export async function getKpisFiduciaire(
  cabinet_id: string,
  annee: number,
  mois: number,
): Promise<KpisFiduciaire> {
  const [r] = (await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE statut = 'validee')::int AS validees,
      count(*) FILTER (WHERE statut IN ('non_demandee', 'en_attente', 'relancee'))::int AS a_valider,
      count(*) FILTER (WHERE statut = 'en_retard')::int AS en_retard,
      count(*) FILTER (WHERE statut IN ('exportee', 'cloturee'))::int AS exportees
    FROM salaire.v_periode_fiduciaire
    WHERE cabinet_id = ${cabinet_id} AND annee = ${annee} AND mois = ${mois}
  `)) as unknown as Array<Record<string, unknown>>;
  return {
    total: Number(r?.total ?? 0),
    validees: Number(r?.validees ?? 0),
    a_valider: Number(r?.a_valider ?? 0),
    en_retard: Number(r?.en_retard ?? 0),
    exportees: Number(r?.exportees ?? 0),
  };
}

/** Vue annuelle d'un client (toutes ses périodes d'une année), scopée cabinet. */
export async function getVueAnnuelleClient(
  cabinet_id: string,
  client_id: string,
  annee: number,
): Promise<PeriodeFiduciaire[]> {
  const rows = (await db.execute(sql`
    SELECT id, client_id, raison_sociale, annee, mois, statut,
           date_limite_validation::text AS date_limite_validation,
           nb_employes_concernes, nb_changements_declares, nb_pieces, validee,
           derniere_modification_par
    FROM salaire.v_periode_fiduciaire
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id} AND annee = ${annee}
    ORDER BY mois
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}
