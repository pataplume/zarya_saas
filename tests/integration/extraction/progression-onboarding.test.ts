/**
 * F7 — progression, relance, édition partagée de l'onboarding (intégration DB + vues).
 *
 * Vérifie : v_session_onboarding_progress (avancement étapes + employés), tracking dernier
 * acteur (édition partagée last-write-wins), v_extractions_a_relancer (inactivité ≥ 7 j) + scope.
 * Réf : onboarding-client.md §9-11 ; migration 0034.
 */
import {
  enregistrerActiviteOnboarding,
  getProgressionOnboarding,
  listerSessionsARelancer,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedSessionOnboarding,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;
let session: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  session = await seedSessionOnboarding(sql, cabinet.id, client.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("progression & relance onboarding (F7)", () => {
  test("progression : étapes franchies + ratio employés validés", async () => {
    await sql`
      UPDATE salaire.session_onboarding
      SET etape_1_terminee_at = now(), etape_2_terminee_at = now(),
          nb_employes_attendus = 4, nb_employes_valides = 2
      WHERE id = ${session.id}`;
    const p = await getProgressionOnboarding(cabinet.id, client.id);
    expect(p?.progression_pct).toBe(60); // étape 2 franchie
    expect(p?.employes_progression_pct).toBe(50); // 2/4
    expect(p?.nb_employes_attendus).toBe(4);
  });

  test("édition partagée : enregistrerActivite met à jour dernier acteur + horodatage", async () => {
    await enregistrerActiviteOnboarding(cabinet.id, session.id, "fiduciaire");
    const p = await getProgressionOnboarding(cabinet.id, client.id);
    expect(p?.dernier_acteur_type).toBe("fiduciaire");
  });

  test("relance : une session inactive ≥ 7 j apparaît ; fraîche non ; scope cabinet", async () => {
    // Rendre la session inactive (8 jours) et non terminée.
    await sql`
      UPDATE salaire.session_onboarding
      SET statut = 'etape_2_en_cours', date_derniere_activite = now() - interval '8 days'
      WHERE id = ${session.id}`;
    const aRelancer = await listerSessionsARelancer(cabinet.id);
    expect(aRelancer.some((s) => s.session_id === session.id)).toBe(true);
    expect(
      aRelancer.find((s) => s.session_id === session.id)?.jours_inactivite,
    ).toBeGreaterThanOrEqual(7);

    // L'autre cabinet ne voit pas cette session.
    const autre = await listerSessionsARelancer(cabinetB.id);
    expect(autre.some((s) => s.session_id === session.id)).toBe(false);
  });

  test("relance : une activité récente retire la session de la file", async () => {
    await enregistrerActiviteOnboarding(cabinet.id, session.id, "client");
    const aRelancer = await listerSessionsARelancer(cabinet.id);
    expect(aRelancer.some((s) => s.session_id === session.id)).toBe(false);
  });

  test("progression : client d'un autre cabinet introuvable (scope)", async () => {
    expect(await getProgressionOnboarding(cabinetB.id, client.id)).toBeNull();
  });
});
