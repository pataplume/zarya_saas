// G7b — Lecture du référentiel employé côté fiduciaire (cycle de vie en cours d'année).
// Toujours scopé cabinet_id. Anti-clair (ADR 0013) : AVS/IBAN ne sont JAMAIS lus en clair —
// seul l'état « renseigné » (vault_id non null) est exposé. Réf : salaire.md §20 ; KICKOFF G7.

import { db, sql } from "@zarya/db";

export interface EmployeReferentiel {
  id: string;
  prenom: string;
  nom: string;
  fonction: string | null;
  statut: string;
  taux_activite: string | null;
  salaire_base_mensuel: string | null;
  date_entree: string | null;
  date_sortie: string | null;
  avs_renseigne: boolean;
  iban_renseigne: boolean;
}

/** Référentiel employé d'un client (tous statuts), scopé cabinet. Anti-clair AVS/IBAN. */
export async function getReferentielEmployes(
  cabinet_id: string,
  client_id: string,
): Promise<EmployeReferentiel[]> {
  const rows = (await db.execute(sql`
    SELECT id, prenom, nom, fonction, statut,
           taux_activite::text AS taux_activite,
           salaire_base_mensuel::text AS salaire_base_mensuel,
           date_entree::text AS date_entree,
           date_sortie::text AS date_sortie,
           (numero_avs_vault_id IS NOT NULL) AS avs_renseigne,
           (iban_vault_id IS NOT NULL) AS iban_renseigne
    FROM salaire.employe
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id} AND archived_at IS NULL
    ORDER BY
      CASE statut WHEN 'actif' THEN 0 WHEN 'propose' THEN 1 WHEN 'sorti' THEN 2 ELSE 3 END,
      nom, prenom
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    prenom: r.prenom as string,
    nom: r.nom as string,
    fonction: (r.fonction as string | null) ?? null,
    statut: r.statut as string,
    taux_activite: (r.taux_activite as string | null) ?? null,
    salaire_base_mensuel: (r.salaire_base_mensuel as string | null) ?? null,
    date_entree: (r.date_entree as string | null) ?? null,
    date_sortie: (r.date_sortie as string | null) ?? null,
    avs_renseigne: Boolean(r.avs_renseigne),
    iban_renseigne: Boolean(r.iban_renseigne),
  }));
}

export interface ClientReferentielContexte {
  raison_sociale: string;
  periode_courante_id: string | null;
}

/**
 * Contexte du référentiel : raison sociale + période « ouverte » la plus récente (non clôturée),
 * requise pour journaliser un mouvement (entrée/sortie/modif). null si aucune période ouverte.
 */
export async function getClientReferentielContexte(
  cabinet_id: string,
  client_id: string,
): Promise<ClientReferentielContexte | null> {
  const [c] = (await db.execute(sql`
    SELECT raison_sociale FROM crm.client
    WHERE id = ${client_id} AND cabinet_id = ${cabinet_id}
    LIMIT 1
  `)) as unknown as Array<{ raison_sociale: string }>;
  if (!c) return null;

  const [p] = (await db.execute(sql`
    SELECT id FROM salaire.periode
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id} AND statut <> 'cloturee'
    ORDER BY annee DESC, mois DESC
    LIMIT 1
  `)) as unknown as Array<{ id: string }>;

  return { raison_sociale: c.raison_sociale, periode_courante_id: p?.id ?? null };
}
