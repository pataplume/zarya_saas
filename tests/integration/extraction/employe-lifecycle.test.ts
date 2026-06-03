/**
 * G7a — cycle de vie du référentiel employé en cours d'année (intégration DB réelle + Vault).
 *
 * Vérifie : entrée vague (réutilise pipeline F6 → employé actif + changement `entree`), sortie
 * (actif→sorti + changement + refus si déjà sorti), modification référentiel (salaire/taux +
 * ancien/nouveau), archivage manuel (sorti→archive + refus si actif), scope cross-cabinet.
 * Réf : salaire.md §20 ; KICKOFF G7.
 */

import { randomUUID } from "node:crypto";
import {
  appliquerModificationReferentiel,
  archiverEmploye,
  enregistrerEntreeReferentiel,
  extraireEmployesDepuisFichier,
  type LigneEmploye,
  sortirEmploye,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEmploye,
  seedPeriode,
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
let periode: { id: string };

/** Crée un employé déjà `actif` avec salaire/taux de base. */
async function seedEmployeActif(salaire = "5000", taux = "100"): Promise<{ id: string }> {
  const e = await seedEmploye(sql, cabinet.id, client.id);
  await sql`UPDATE salaire.employe SET statut = 'actif', salaire_base_mensuel = ${salaire}, taux_activite = ${taux} WHERE id = ${e.id}`;
  return e;
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  periode = await seedPeriode(sql, cabinet.id, client.id);
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("enregistrerEntreeReferentiel (G7a — entrée vague)", () => {
  test("finalise une proposition validée → employé actif + changement entree + événement", async () => {
    const session = await seedSessionOnboarding(sql, cabinet.id, client.id);
    const upload = await seedUploadFichier(sql, cabinet.id, client.id, session.id);
    const ligne: LigneEmploye = {
      prenom: { valeur: "Alice", source_cellule: "A2" },
      nom: { valeur: "Martin", source_cellule: "B2" },
      date_naissance: { valeur: "1990-06-01", source_cellule: "C2" },
      numero_avs: { valeur: "756.1234.5678.97", source_cellule: "D2" },
      iban: { valeur: "CH9300762011623852957", source_cellule: "E2" },
      date_entree: { valeur: "2026-06-01", source_cellule: "F2" },
      salaire_base_mensuel: { valeur: "7000", source_cellule: "G2" },
    };
    const { proposition_ids } = await extraireEmployesDepuisFichier({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      upload_fichier_id: upload.id,
      nom_fichier: "vague.csv",
      lignes: [ligne],
    });
    const propId = proposition_ids[0] as string;
    await sql`
      UPDATE salaire.proposition_champ
      SET statut = 'valide', valeur_finale = COALESCE(valeur_finale, valeur_proposee)
      WHERE proposition_employe_id = ${propId} AND statut = 'propose'`;

    const res = await enregistrerEntreeReferentiel({
      cabinet_id: cabinet.id,
      proposition_employe_id: propId,
      periode_id: periode.id,
      date_entree: "2026-06-01",
      acteur_id: randomUUID(),
    });

    const [emp] =
      await sql`SELECT statut, date_entree::text AS date_entree FROM salaire.employe WHERE id = ${res.employe_id}`;
    expect(emp?.statut).toBe("actif");
    expect(emp?.date_entree).toBe("2026-06-01");

    const [ch] =
      await sql`SELECT type, applique_dans_referentiel FROM salaire.changement WHERE id = ${res.changement_id}`;
    expect(ch?.type).toBe("entree");
    expect(ch?.applique_dans_referentiel).toBe(true);

    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${periode.id} AND type = 'employe_confirme'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });
});

describe("sortirEmploye (G7a)", () => {
  test("actif → sorti + changement sortie ; refuse une 2e sortie", async () => {
    const e = await seedEmployeActif();
    const res = await sortirEmploye({
      cabinet_id: cabinet.id,
      employe_id: e.id,
      periode_id: periode.id,
      date_sortie: "2026-06-30",
      motif: "Fin de contrat",
      acteur_id: randomUUID(),
    });

    const [emp] =
      await sql`SELECT statut, date_sortie::text AS date_sortie FROM salaire.employe WHERE id = ${e.id}`;
    expect(emp?.statut).toBe("sorti");
    expect(emp?.date_sortie).toBe("2026-06-30");

    const [ch] = await sql`SELECT type FROM salaire.changement WHERE id = ${res.changement_id}`;
    expect(ch?.type).toBe("sortie");

    await expect(
      sortirEmploye({
        cabinet_id: cabinet.id,
        employe_id: e.id,
        periode_id: periode.id,
        date_sortie: "2026-07-31",
        acteur_id: randomUUID(),
      }),
    ).rejects.toThrow(/actif/i);
  });
});

describe("appliquerModificationReferentiel (G7a)", () => {
  test("changement de salaire → référentiel mis à jour + ancien/nouveau journalisés", async () => {
    const e = await seedEmployeActif("5000", "100");
    const res = await appliquerModificationReferentiel({
      cabinet_id: cabinet.id,
      employe_id: e.id,
      periode_id: periode.id,
      type: "changement_salaire",
      date_effet: "2026-07-01",
      nouveau_salaire_base: 5500,
      acteur_id: randomUUID(),
    });

    const [emp] =
      await sql`SELECT statut, salaire_base_mensuel FROM salaire.employe WHERE id = ${e.id}`;
    expect(emp?.statut).toBe("actif");
    expect(emp?.salaire_base_mensuel).toBe("5500.00");

    const [ch] =
      await sql`SELECT type, ancien_salaire_base, nouveau_salaire_base FROM salaire.changement WHERE id = ${res.changement_id}`;
    expect(ch?.type).toBe("changement_salaire");
    expect(ch?.ancien_salaire_base).toBe("5000.00");
    expect(ch?.nouveau_salaire_base).toBe("5500.00");
  });
});

describe("archiverEmploye (G7a)", () => {
  test("refuse l'archivage d'un employé actif ; sorti → archive", async () => {
    const e = await seedEmployeActif();
    await expect(
      archiverEmploye({ cabinet_id: cabinet.id, employe_id: e.id, acteur_id: randomUUID() }),
    ).rejects.toThrow(/sorti/i);

    await sortirEmploye({
      cabinet_id: cabinet.id,
      employe_id: e.id,
      periode_id: periode.id,
      date_sortie: "2026-06-30",
      acteur_id: randomUUID(),
    });
    await archiverEmploye({ cabinet_id: cabinet.id, employe_id: e.id, acteur_id: randomUUID() });

    const [emp] = await sql`SELECT statut, archived_at FROM salaire.employe WHERE id = ${e.id}`;
    expect(emp?.statut).toBe("archive");
    expect(emp?.archived_at).not.toBeNull();
  });
});

describe("scope cross-cabinet (G7a)", () => {
  test("un autre cabinet ne peut pas sortir l'employé", async () => {
    const e = await seedEmployeActif();
    await expect(
      sortirEmploye({
        cabinet_id: cabinetB.id,
        employe_id: e.id,
        periode_id: periode.id,
        date_sortie: "2026-06-30",
        acteur_id: randomUUID(),
      }),
    ).rejects.toThrow(/introuvable/i);
  });
});
