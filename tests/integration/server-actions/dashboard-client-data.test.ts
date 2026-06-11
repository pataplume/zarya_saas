/**
 * F8 — vues filtrées du dashboard client (intégration DB réelle).
 *
 * Vérifie : lecture scopée (client A ne voit jamais client B), AVS/IBAN MASQUÉS (booléen
 * *_renseigne seulement, jamais le clair ni le vault_id), documents/entreprise filtrés.
 * Réf : dashboard-client.md §6/§7/§9/§13 ; migration 0035 ; ADR 0013.
 */
import { extraireEmployesDepuisFichier, type LigneEmploye } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getDocumentsClient,
  getEmployesClient,
  getEntrepriseClient,
} from "../../../apps/web/lib/dashboard-client-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDepotClient,
  seedSessionOnboarding,
  seedTwoCabinets,
  seedUploadFichier,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let clientB: TestClient;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  clientB = await seedClient(sql, cabinetB.id);

  // Employé pour A (avec AVS+IBAN → renseignés au Vault).
  const sessionA = await seedSessionOnboarding(sql, cabinetA.id, clientA.id);
  const uploadA = await seedUploadFichier(sql, cabinetA.id, clientA.id, sessionA.id);
  const ligne: LigneEmploye = {
    prenom: { valeur: "Jean", source_cellule: "A2" },
    nom: { valeur: "Dupont", source_cellule: "B2" },
    fonction: { valeur: "Comptable", source_cellule: "C2" },
    date_naissance: { valeur: "1985-03-12", source_cellule: "D2" },
    numero_avs: { valeur: "756.1234.5678.97", source_cellule: "E2" },
    iban: { valeur: "CH9300762011623852957", source_cellule: "F2" },
    date_entree: { valeur: "2022-01-03", source_cellule: "G2" },
  };
  const { proposition_ids } = await extraireEmployesDepuisFichier({
    cabinet_id: cabinetA.id,
    client_id: clientA.id,
    session_id: sessionA.id,
    upload_fichier_id: uploadA.id,
    nom_fichier: "e.csv",
    lignes: [ligne],
  });
  // Finalise un employé directement en base (statut actif + vault_id AVS/IBAN renseignés).
  const [avs] = await sql`
    SELECT valeur_proposee_normalisee->>'vault_id' AS v FROM salaire.proposition_champ
    WHERE proposition_employe_id = ${proposition_ids[0]} AND nom_champ = 'numero_avs'`;
  const [iban] = await sql`
    SELECT valeur_proposee_normalisee->>'vault_id' AS v FROM salaire.proposition_champ
    WHERE proposition_employe_id = ${proposition_ids[0]} AND nom_champ = 'iban'`;
  await sql`
    INSERT INTO salaire.employe
      (cabinet_id, client_id, prenom, nom, fonction, statut, numero_avs_vault_id, iban_vault_id)
    VALUES (${cabinetA.id}, ${clientA.id}, 'Jean', 'Dupont', 'Comptable', 'actif',
            ${avs?.v}, ${iban?.v})`;

  // Dépôt client transmis pour A (upload_brut source 'upload_client' → lu par getDocumentsClient).
  await seedDepotClient(sql, cabinetA.id, clientA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("vues dashboard client (F8)", () => {
  test("entreprise : champs publics, scopés au client", async () => {
    const e = await getEntrepriseClient(cabinetA.id, clientA.id);
    expect(e?.raison_sociale).toBe(clientA.raison_sociale ?? e?.raison_sociale);
    expect(e?.client_id).toBe(clientA.id);
    // Scope : le client B (autre cabinet) n'est pas accessible avec le scope de A.
    expect(await getEntrepriseClient(cabinetA.id, clientB.id)).toBeNull();
  });

  test("employés : AVS/IBAN masqués (booléen renseigné, jamais le clair ni le vault_id)", async () => {
    const emps = await getEmployesClient(cabinetA.id, clientA.id);
    expect(emps.length).toBeGreaterThanOrEqual(1);
    const jean = emps.find((e) => e.nom === "Dupont");
    expect(jean?.avs_renseigne).toBe(true);
    expect(jean?.iban_renseigne).toBe(true);
    // La structure exposée ne contient aucun champ de secret en clair ni vault_id.
    const keys = Object.keys(jean ?? {});
    expect(keys).not.toContain("numero_avs");
    expect(keys).not.toContain("numero_avs_vault_id");
    expect(keys).not.toContain("iban");
    expect(keys).not.toContain("iban_vault_id");
    expect(JSON.stringify(emps)).not.toContain("756.1234");
    expect(JSON.stringify(emps)).not.toContain("CH9300762011");
  });

  test("employés : scope cabinet (le scope de B ne voit pas l'employé de A)", async () => {
    expect(await getEmployesClient(cabinetB.id, clientA.id)).toHaveLength(0);
  });

  test("documents : scopés au client, métadonnées seulement", async () => {
    const docs = await getDocumentsClient(cabinetA.id, clientA.id);
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0]).toHaveProperty("nom");
    expect(docs[0]).toHaveProperty("statut_label");
    expect(await getDocumentsClient(cabinetA.id, clientB.id)).toHaveLength(0);
  });
});
