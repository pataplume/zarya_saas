/**
 * F6c — finalisation proposition → salaire.employe (cœur app-code, intégration DB + Vault).
 *
 * Vérifie : création salaire.employe depuis les champs validés ; réutilisation du vault_id
 * AVS/IBAN (anti-clair, ADR 0013) ; lien proposition.employe_id + statut validee ; compteur
 * de session ; blocage strict si un obligatoire-Swissdec n'est pas validé (ADR 0007).
 *
 * Réf : docs/modules/onboarding-client.md §7.6-7.8 ; ADR 0007/0013/0021 ; KICKOFF F6c.
 */

import { vaultGetSecret } from "@zarya/db";
import {
  ajouterEmployeManuel,
  extraireEmployesDepuisFichier,
  FinalisationBloqueeError,
  finaliserPropositionEmploye,
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

const ligneComplete: LigneEmploye = {
  prenom: { valeur: "Jean", source_cellule: "A2" },
  nom: { valeur: "Dupont", source_cellule: "B2" },
  date_naissance: { valeur: "1985-03-12", source_cellule: "C2" },
  numero_avs: { valeur: "756.1234.5678.97", source_cellule: "D2" },
  iban: { valeur: "CH9300762011623852957", source_cellule: "E2" },
  date_entree: { valeur: "2022-01-03", source_cellule: "F2" },
  salaire_base_mensuel: { valeur: "6500", source_cellule: "G2" },
};

describe("finaliserPropositionEmploye (F6c)", () => {
  test("crée salaire.employe avec vault_id AVS/IBAN réutilisés + lie la proposition + compteur", async () => {
    const { proposition_ids } = await extraireEmployesDepuisFichier({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      upload_fichier_id: upload.id,
      nom_fichier: "e.csv",
      lignes: [ligneComplete],
    });
    const propId = proposition_ids[0] as string;

    // vault_id AVS de la proposition (pour vérifier la réutilisation).
    const [avsProp] = await sql`
      SELECT valeur_proposee_normalisee->>'vault_id' AS vault_id
      FROM salaire.proposition_champ
      WHERE proposition_employe_id = ${propId} AND nom_champ = 'numero_avs'`;
    const avsVaultId = avsProp?.vault_id as string;

    // Validation granulaire : on valide tous les champs (valeur_finale = valeur_proposee).
    await sql`
      UPDATE salaire.proposition_champ
      SET statut = 'valide', valeur_finale = COALESCE(valeur_finale, valeur_proposee)
      WHERE proposition_employe_id = ${propId} AND statut = 'propose'`;

    const { employe_id } = await finaliserPropositionEmploye({
      cabinet_id: cabinet.id,
      proposition_employe_id: propId,
      valide_par_type: "fiduciaire",
    });

    const [emp] = await sql`
      SELECT prenom, nom, statut, cree_via_onboarding,
             numero_avs_vault_id, iban_vault_id, salaire_base_mensuel
      FROM salaire.employe WHERE id = ${employe_id}`;
    expect(emp?.prenom).toBe("Jean");
    expect(emp?.statut).toBe("actif");
    expect(emp?.cree_via_onboarding).toBe(true);
    expect(emp?.salaire_base_mensuel).toBe("6500.00");
    // Réutilisation du vault_id de la proposition (anti-clair, pas de re-chiffrement).
    expect(emp?.numero_avs_vault_id).toBe(avsVaultId);
    expect(await vaultGetSecret(emp?.numero_avs_vault_id as string)).toBe("756.1234.5678.97");
    expect(await vaultGetSecret(emp?.iban_vault_id as string)).toBe("CH9300762011623852957");

    // Proposition liée + statut validee.
    const [prop] = await sql`
      SELECT statut, employe_id FROM salaire.proposition_employe WHERE id = ${propId}`;
    expect(prop?.statut).toBe("validee");
    expect(prop?.employe_id).toBe(employe_id);

    // Compteur de session incrémenté.
    const [sess] = await sql`
      SELECT nb_employes_valides FROM salaire.session_onboarding WHERE id = ${session.id}`;
    expect(sess?.nb_employes_valides).toBeGreaterThanOrEqual(1);
  });

  test("refuse la finalisation si un obligatoire-Swissdec n'est pas validé", async () => {
    // Proposition manuelle incomplète (prénom/nom seulement) → AVS/date manquants non validés.
    const { proposition_id } = await ajouterEmployeManuel({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      saisie: { prenom: "Partiel", nom: "Incomplet" },
    });
    await sql`
      UPDATE salaire.proposition_champ SET statut = 'valide'
      WHERE proposition_employe_id = ${proposition_id} AND statut = 'propose'`;

    await expect(
      finaliserPropositionEmploye({
        cabinet_id: cabinet.id,
        proposition_employe_id: proposition_id,
        valide_par_type: "fiduciaire",
      }),
    ).rejects.toBeInstanceOf(FinalisationBloqueeError);

    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM salaire.employe
      WHERE proposition_employe_id = ${proposition_id}`;
    expect(n).toBe(0);
  });
});
