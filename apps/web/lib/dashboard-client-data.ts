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

export interface DocumentClient {
  id: string;
  type: string;
  categorie: string;
  periode: string | null;
  libelle: string;
  statut_classement: string;
  created_at: string;
}

export async function getDocumentsClient(
  cabinet_id: string,
  client_id: string,
): Promise<DocumentClient[]> {
  const rows = (await db.execute(sql`
    SELECT id, type, categorie, periode, libelle, statut_classement, created_at
    FROM doc.v_dashboard_client_document
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    ORDER BY created_at DESC
    LIMIT 200
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    type: r.type as string,
    categorie: r.categorie as string,
    periode: (r.periode as string | null) ?? null,
    libelle: r.libelle as string,
    statut_classement: r.statut_classement as string,
    created_at: String(r.created_at),
  }));
}
