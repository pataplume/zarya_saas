/**
 * F6d — clôture de session + garde « onboarding bloquant » (intégration DB réelle).
 *
 * Vérifie : refus de terminer tant qu'une proposition est en_attente ; passage à terminee
 * quand terminable ; assertOnboardingTermine bloque avant / passe après. Réf onboarding-client §2/§8.
 */
import {
  ajouterEmployeManuel,
  assertOnboardingTermine,
  evaluerCompletude,
  OnboardingNonTermineError,
  terminerOnboarding,
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

describe("onboarding bloquant + clôture (F6d)", () => {
  test("garde : assertOnboardingTermine bloque tant que non terminée", async () => {
    await expect(assertOnboardingTermine(cabinet.id, client.id)).rejects.toBeInstanceOf(
      OnboardingNonTermineError,
    );
  });

  test("refus de terminer s'il reste une proposition en attente", async () => {
    // Une proposition manuelle (statut en_attente par défaut) → non terminable.
    await ajouterEmployeManuel({
      cabinet_id: cabinet.id,
      client_id: client.id,
      session_id: session.id,
      saisie: { prenom: "Jean", nom: "Dupont" },
    });
    const c = await evaluerCompletude(cabinet.id, session.id);
    expect(c?.terminable).toBe(false);
    expect(c?.propositions_en_attente).toBeGreaterThanOrEqual(1);
    await expect(terminerOnboarding(cabinet.id, session.id)).rejects.toThrow(/en attente/i);
  });

  test("termine quand aucune proposition en attente + ≥1 employé validé", async () => {
    // On solde les propositions (validee) et on simule un employé validé.
    await sql`UPDATE salaire.proposition_employe SET statut = 'validee' WHERE session_id = ${session.id}`;
    await sql`UPDATE salaire.session_onboarding SET nb_employes_valides = 1 WHERE id = ${session.id}`;

    const res = await terminerOnboarding(cabinet.id, session.id);
    expect(res.statut).toBe("terminee");

    const [s] = await sql`
      SELECT statut, date_fin, etape_3b_terminee_at FROM salaire.session_onboarding WHERE id = ${session.id}`;
    expect(s?.statut).toBe("terminee");
    expect(s?.date_fin).not.toBeNull();

    // Idempotent + garde passe désormais.
    expect((await terminerOnboarding(cabinet.id, session.id)).statut).toBe("terminee");
    await expect(assertOnboardingTermine(cabinet.id, client.id)).resolves.toBeUndefined();
  });
});
