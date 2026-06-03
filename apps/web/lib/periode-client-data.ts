// G3a — Lecture de la période de paie côté dashboard client (flow E §4 / salaire.md §7.4).
// Toujours scopé (cabinet_id, client_id). Le client ne voit que ses propres périodes + les
// types d'éléments marqués visible_client. Lecture seule (les écritures = server actions).

import { db, sql } from "@zarya/db";

export interface PeriodeResume {
  id: string;
  annee: number;
  mois: number;
  statut: string;
  date_limite_validation: string;
  pre_remplie: boolean;
}

export async function listerPeriodesClient(
  cabinet_id: string,
  client_id: string,
): Promise<PeriodeResume[]> {
  const rows = (await db.execute(sql`
    SELECT id, annee, mois, statut, date_limite_validation::text AS date_limite_validation, pre_remplie
    FROM salaire.periode
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    ORDER BY annee DESC, mois DESC
    LIMIT 36
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    annee: Number(r.annee),
    mois: Number(r.mois),
    statut: r.statut as string,
    date_limite_validation: String(r.date_limite_validation),
    pre_remplie: Boolean(r.pre_remplie),
  }));
}

export interface PeriodeEmploye {
  id: string;
  prenom: string;
  nom: string;
}
export interface PeriodeTypeElement {
  id: string;
  code: string;
  libelle: string;
  unite: string;
}
export interface PeriodeElement {
  employe_id: string;
  type_element_id: string;
  valeur_numerique: string | null;
}
export interface PeriodeDetailClient {
  periode: PeriodeResume & { editable: boolean };
  employes: PeriodeEmploye[];
  types: PeriodeTypeElement[];
  elements: PeriodeElement[];
}

// Statuts où le client peut encore compléter / valider la période.
const STATUTS_EDITABLES = new Set(["non_demandee", "en_attente", "relancee", "en_retard"]);

/** Détail d'une période scopée au client (matrice employés × éléments). null si pas la sienne. */
export async function getPeriodeDetailClient(
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<PeriodeDetailClient | null> {
  const [p] = (await db.execute(sql`
    SELECT id, annee, mois, statut, date_limite_validation::text AS date_limite_validation, pre_remplie
    FROM salaire.periode
    WHERE id = ${periode_id} AND cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  if (!p) return null;

  const employes = (await db.execute(sql`
    SELECT id, prenom, nom FROM salaire.employe
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
      AND statut = 'actif' AND archived_at IS NULL
    ORDER BY nom, prenom
  `)) as unknown as Array<Record<string, unknown>>;

  const types = (await db.execute(sql`
    SELECT id, code, libelle_fr AS libelle, unite FROM salaire.type_element_paie
    WHERE visible_client = true AND actif = true
      AND (cabinet_id IS NULL OR cabinet_id = ${cabinet_id})
    ORDER BY ordre_affichage, code
  `)) as unknown as Array<Record<string, unknown>>;

  const elements = (await db.execute(sql`
    SELECT employe_id, type_element_id, valeur_numerique::text AS valeur_numerique
    FROM salaire.element_paie WHERE periode_id = ${periode_id} AND cabinet_id = ${cabinet_id}
  `)) as unknown as Array<Record<string, unknown>>;

  return {
    periode: {
      id: p.id as string,
      annee: Number(p.annee),
      mois: Number(p.mois),
      statut: p.statut as string,
      date_limite_validation: String(p.date_limite_validation),
      pre_remplie: Boolean(p.pre_remplie),
      editable: STATUTS_EDITABLES.has(p.statut as string),
    },
    employes: employes.map((e) => ({
      id: e.id as string,
      prenom: e.prenom as string,
      nom: e.nom as string,
    })),
    types: types.map((t) => ({
      id: t.id as string,
      code: t.code as string,
      libelle: t.libelle as string,
      unite: t.unite as string,
    })),
    elements: elements.map((el) => ({
      employe_id: el.employe_id as string,
      type_element_id: el.type_element_id as string,
      valeur_numerique: (el.valeur_numerique as string | null) ?? null,
    })),
  };
}

export { STATUTS_EDITABLES };
