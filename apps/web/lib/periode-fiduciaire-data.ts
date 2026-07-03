// RUN1 — Lecture d'une période de paie côté DASHBOARD FIDUCIAIRE (écran de détail).
// Scopé cabinet_id uniquement (le fiduciaire voit les périodes de tous ses clients) ;
// le client_id est dérivé de la période. Contrairement au client, le fiduciaire voit
// TOUS les types d'éléments actifs (pas seulement visible_client) et l'état d'export.
// Lecture seule (les écritures = server actions de salaire/actions.ts).

import { db, sql } from "@zarya/db";

export interface PeriodeFiduEmploye {
  id: string;
  prenom: string;
  nom: string;
}
export interface PeriodeFiduType {
  id: string;
  code: string;
  libelle: string;
  unite: string;
}
export interface PeriodeFiduElement {
  employe_id: string;
  type_element_id: string;
  valeur_numerique: string | null;
}
export interface PeriodeFiduDetail {
  periode: {
    id: string;
    client_id: string;
    raison_sociale: string;
    annee: number;
    mois: number;
    statut: string;
    date_limite_validation: string | null;
    date_validation_recue: string | null;
    revue_fiduciaire_at: string | null;
    /** Le fiduciaire peut encore saisir/corriger (tout sauf clôturé/non applicable). */
    editable: boolean;
  };
  employes: PeriodeFiduEmploye[];
  types: PeriodeFiduType[];
  elements: PeriodeFiduElement[];
  /** Dernier export généré pour cette période (pour le bouton « Confirmer import »). */
  dernierExport: { id: string; statut: string } | null;
}

// Statuts où le fiduciaire peut encore éditer (exportee inclus = fenêtre de correction).
const STATUTS_EDITABLES_FIDU = new Set([
  "non_demandee",
  "en_attente",
  "relancee",
  "en_retard",
  "validee",
  "exportee",
]);

/**
 * Détail d'une période scopée cabinet (n'importe quel client du cabinet).
 * Retourne null si la période n'appartient pas au cabinet (anti-fuite).
 */
export async function getPeriodeDetailFiduciaire(
  cabinet_id: string,
  periode_id: string,
): Promise<PeriodeFiduDetail | null> {
  const [p] = (await db.execute(sql`
    SELECT p.id, p.client_id, c.raison_sociale,
           p.annee, p.mois, p.statut,
           p.date_limite_validation::text  AS date_limite_validation,
           p.date_validation_recue::text   AS date_validation_recue,
           p.revue_fiduciaire_at::text     AS revue_fiduciaire_at
    FROM salaire.periode p
    JOIN crm.client c ON c.id = p.client_id
    WHERE p.id = ${periode_id} AND p.cabinet_id = ${cabinet_id}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  if (!p) return null;

  const client_id = p.client_id as string;

  const employes = (await db.execute(sql`
    SELECT id, prenom, nom FROM salaire.employe
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
      AND statut = 'actif' AND archived_at IS NULL
    ORDER BY nom, prenom
  `)) as unknown as Array<Record<string, unknown>>;

  // Le fiduciaire voit TOUS les types actifs (y compris ceux masqués au client).
  const types = (await db.execute(sql`
    SELECT id, code, libelle_fr AS libelle, unite FROM salaire.type_element_paie
    WHERE actif = true AND (cabinet_id IS NULL OR cabinet_id = ${cabinet_id})
    ORDER BY ordre_affichage, code
  `)) as unknown as Array<Record<string, unknown>>;

  const elements = (await db.execute(sql`
    SELECT employe_id, type_element_id, valeur_numerique::text AS valeur_numerique
    FROM salaire.element_paie WHERE periode_id = ${periode_id} AND cabinet_id = ${cabinet_id}
  `)) as unknown as Array<Record<string, unknown>>;

  const [exp] = (await db.execute(sql`
    SELECT id, statut FROM salaire.export
    WHERE periode_id = ${periode_id} AND cabinet_id = ${cabinet_id}
    ORDER BY genere_le DESC
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;

  const statut = p.statut as string;
  return {
    periode: {
      id: p.id as string,
      client_id,
      raison_sociale: (p.raison_sociale as string | null) ?? "",
      annee: Number(p.annee),
      mois: Number(p.mois),
      statut,
      date_limite_validation: (p.date_limite_validation as string | null) ?? null,
      date_validation_recue: (p.date_validation_recue as string | null) ?? null,
      revue_fiduciaire_at: (p.revue_fiduciaire_at as string | null) ?? null,
      editable: STATUTS_EDITABLES_FIDU.has(statut),
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
    dernierExport: exp ? { id: exp.id as string, statut: exp.statut as string } : null,
  };
}
