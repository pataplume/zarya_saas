// F8 — Accès aux données du dashboard client via les vues filtrées v_dashboard_client_*
// (dashboard-client.md §13.2). Le rôle client_contact ne lit JAMAIS les tables directement.
// Toujours scopé par (cabinet_id, client_id) portés par l'app_metadata du JWT (server-controlled).
// AVS/IBAN : seuls les booléens *_renseigne remontent — jamais le clair ni le vault_id.

import { db, sql } from "@zarya/db";

export interface EntrepriseClient {
  client_id: string;
  raison_sociale: string;
  ide: string | null;
  forme_juridique: string | null;
  type: string;
  statut: string;
}

export async function getEntrepriseClient(
  cabinet_id: string,
  client_id: string,
): Promise<EntrepriseClient | null> {
  const rows = (await db.execute(sql`
    SELECT client_id, raison_sociale, ide, forme_juridique, type, statut
    FROM crm.v_dashboard_client_entreprise
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    client_id: r.client_id as string,
    raison_sociale: r.raison_sociale as string,
    ide: (r.ide as string | null) ?? null,
    forme_juridique: (r.forme_juridique as string | null) ?? null,
    type: r.type as string,
    statut: r.statut as string,
  };
}

export interface EmployeClient {
  id: string;
  prenom: string;
  nom: string;
  fonction: string | null;
  taux_activite: string | null;
  type_contrat: string | null;
  statut: string;
  avs_renseigne: boolean;
  iban_renseigne: boolean;
}

export async function getEmployesClient(
  cabinet_id: string,
  client_id: string,
): Promise<EmployeClient[]> {
  const rows = (await db.execute(sql`
    SELECT id, prenom, nom, fonction, taux_activite, type_contrat, statut,
           avs_renseigne, iban_renseigne
    FROM salaire.v_dashboard_client_employe
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    ORDER BY nom, prenom
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    prenom: r.prenom as string,
    nom: r.nom as string,
    fonction: (r.fonction as string | null) ?? null,
    taux_activite: (r.taux_activite as string | null) ?? null,
    type_contrat: (r.type_contrat as string | null) ?? null,
    statut: r.statut as string,
    avs_renseigne: Boolean(r.avs_renseigne),
    iban_renseigne: Boolean(r.iban_renseigne),
  }));
}

// Famille de statut côté client (UX §8 : pas de jargon). Pilote couleur + libellé.
export type StatutClientFamille = "en_cours" | "classe" | "doublon" | "echec";

export interface DocumentClient {
  id: string;
  nom: string;
  statut_famille: StatutClientFamille;
  statut_label: string;
  date_upload: string;
  // Renseignés seulement une fois le document validé et classé par le cabinet.
  type: string | null;
  categorie: string | null;
  periode: string | null;
}

/**
 * Documents déposés PAR le client, visibles dès le dépôt (et non plus seulement
 * après validation humaine). On lit la trace de dépôt `doc.upload_brut` (présente
 * dès le drag&drop), et on rattache le document final `doc.document` s'il a été
 * validé. Scopé (cabinet_id, client_id) du JWT — jamais d'URL/body. Aucune colonne
 * sensible n'est projetée (pas de hash, storage_path, ocr_text, vault_id, coût).
 */
export async function getDocumentsClient(
  cabinet_id: string,
  client_id: string,
): Promise<DocumentClient[]> {
  const rows = (await db.execute(sql`
    SELECT
      ub.id,
      ub.nom_fichier_original,
      ub.statut AS statut_upload,
      ub.date_upload,
      d.id AS document_id,
      d.libelle,
      d.type,
      d.categorie::text AS categorie,
      d.periode
    FROM doc.upload_brut ub
    LEFT JOIN doc.fichier_physique fp ON fp.upload_brut_id = ub.id
    LEFT JOIN doc.document d
      ON d.fichier_physique_id = fp.id AND d.cabinet_id = ub.cabinet_id
      AND d.archived_at IS NULL
    WHERE ub.cabinet_id = ${cabinet_id}
      AND ub.client_id = ${client_id}
      AND ub.source = 'upload_client'
    ORDER BY ub.date_upload DESC
    LIMIT 200
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const valide = r.document_id != null;
    const statutUpload = r.statut_upload as string;
    const { famille, label } = mapStatutClient(valide, statutUpload);
    return {
      id: r.id as string,
      nom: valide
        ? ((r.libelle as string | null) ?? (r.nom_fichier_original as string))
        : (r.nom_fichier_original as string),
      statut_famille: famille,
      statut_label: label,
      date_upload: String(r.date_upload),
      type: valide ? ((r.type as string | null) ?? null) : null,
      categorie: valide ? ((r.categorie as string | null) ?? null) : null,
      periode: valide ? ((r.periode as string | null) ?? null) : null,
    };
  });
}

// Traduit l'état technique du dépôt en message client clair (UX §8).
function mapStatutClient(
  valide: boolean,
  statutUpload: string,
): { famille: StatutClientFamille; label: string } {
  if (valide) return { famille: "classe", label: "Classé" };
  switch (statutUpload) {
    case "recu":
    case "en_classification":
    case "a_valider":
      return { famille: "en_cours", label: "Reçu · en cours de traitement" };
    case "valide":
      return { famille: "classe", label: "Classé" };
    case "doublon":
      return { famille: "doublon", label: "Déjà reçu" };
    case "erreur":
      return { famille: "echec", label: "Échec — à redéposer" };
    default:
      return { famille: "en_cours", label: "En traitement" };
  }
}
