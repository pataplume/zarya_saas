/**
 * F6b — pipeline d'extraction employés (intégration, DB réelle + Vault).
 *
 * Vérifie : persistance extraction_ia + proposition_employe + proposition_champ ;
 * ANTI-CLAIR (ADR 0013) AVS/IBAN chiffrés au Vault dès la proposition (valeur masquée +
 * vault_id récupérable) ; mode manuel (extraction_id null). db service role réel.
 *
 * Réf : docs/data-model/onboarding-client-schema.md §5-7 ; ADR 0007/0013 ; KICKOFF F6b.
 */

import { vaultGetSecret } from "@zarya/db";
import {
  ajouterEmployeManuel,
  extraireEmployesDepuisFichier,
  type LigneEmploye,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedSessionOnboarding,
  seedTwoCabinets,
  seedUploadFichier,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;
let session: { id: string };
let upload: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  session = await seedSessionOnboarding(sql, cabinet.id, client.id);
  upload = await seedUploadFichier(sql, cabinet.id, client.id, session.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("extraireEmployesDepuisFichier (F6b)", () => {
  test("persiste extraction_ia + propositions + champs ; AVS/IBAN au Vault (anti-clair)", async () => {
    const lignes: LigneEmploye[] = [
      {
        prenom: { valeur: "Jean", source_cellule: "A2" },
        nom: { valeur: "Dupont", source_cellule: "B2" },
        date_naissance: { valeur: "1985-03-12", source_cellule: "C2" },
        numero_avs: { valeur: "756.1234.5678.97", source_cellule: "D2" },
        iban: { valeur: "CH9300762011623852957", source_cellule: "E2" },
        date_entree: { valeur: "2022-01-03", source_cellule: "F2" },
      },
    ];
    const res = await extraireEmployesDepuisFichier({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      upload_fichier_id: upload.id,
      nom_fichier: "employes.csv",
      lignes,
    });
    expect(res.nb_employes_detectes).toBe(1);
    expect(res.proposition_ids).toHaveLength(1);

    // extraction_ia tracée, sans PII en clair dans donnees_brutes.
    const [extr] = await sql`
      SELECT statut, nb_employes_detectes, donnees_brutes::text AS brut
      FROM salaire.extraction_ia WHERE id = ${res.extraction_id}`;
    expect(extr?.statut).toBe("succes");
    expect(extr?.nb_employes_detectes).toBe(1);
    expect(extr?.brut).not.toContain("756.1234");

    // AVS : valeur masquée en clair + vault_id récupérable au Vault = la valeur réelle.
    const [avs] = await sql`
      SELECT valeur_proposee, valeur_proposee_normalisee->>'vault_id' AS vault_id, statut
      FROM salaire.proposition_champ
      WHERE proposition_employe_id = ${res.proposition_ids[0]} AND nom_champ = 'numero_avs'`;
    expect(avs?.valeur_proposee).toBe("756.****.****.**");
    expect(avs?.vault_id).toBeTruthy();
    expect(await vaultGetSecret(avs?.vault_id as string)).toBe("756.1234.5678.97");

    // IBAN idem.
    const [iban] = await sql`
      SELECT valeur_proposee, valeur_proposee_normalisee->>'vault_id' AS vault_id
      FROM salaire.proposition_champ
      WHERE proposition_employe_id = ${res.proposition_ids[0]} AND nom_champ = 'iban'`;
    expect(iban?.valeur_proposee).toBe("CH..****2957");
    expect(await vaultGetSecret(iban?.vault_id as string)).toBe("CH9300762011623852957");

    // Champ non sensible : en clair.
    const [prenom] = await sql`
      SELECT valeur_proposee FROM salaire.proposition_champ
      WHERE proposition_employe_id = ${res.proposition_ids[0]} AND nom_champ = 'prenom'`;
    expect(prenom?.valeur_proposee).toBe("Jean");

    // Aucune colonne AVS/IBAN en clair dans toute la table proposition_champ pour ce cabinet.
    const fuites = await sql`
      SELECT 1 FROM salaire.proposition_champ
      WHERE cabinet_id = ${cabinet.id} AND valeur_proposee LIKE '756.1234%'`;
    expect(fuites).toHaveLength(0);
  });

  test("mode manuel : crée une proposition avec extraction_id null", async () => {
    const { proposition_id } = await ajouterEmployeManuel({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      saisie: { prenom: "Léa", nom: "Berger", numero_avs: "756.5555.4444.33" },
    });
    const [prop] = await sql`
      SELECT extraction_id FROM salaire.proposition_employe WHERE id = ${proposition_id}`;
    expect(prop?.extraction_id).toBeNull();

    const [avs] = await sql`
      SELECT valeur_proposee, valeur_proposee_normalisee->>'vault_id' AS vault_id
      FROM salaire.proposition_champ
      WHERE proposition_employe_id = ${proposition_id} AND nom_champ = 'numero_avs'`;
    expect(avs?.valeur_proposee).toBe("756.****.****.**");
    expect(await vaultGetSecret(avs?.vault_id as string)).toBe("756.5555.4444.33");
  });
});
