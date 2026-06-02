/**
 * F6d — server action de clôture d'onboarding (authentifiée, DB réelle).
 * `@zarya/auth` mocké. Vérifie : refus si incomplet, succès si terminable, RBAC, anti-fuite.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedSessionOnboarding,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { terminerOnboardingAction } = await import(
  "../../../apps/web/app/(app)/app/clients/onboarding/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let sessionA: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  sessionA = await seedSessionOnboarding(sql, cabinetA.id, clientA.id);
});

afterEach(() => {
  authState.user = null;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function acteur(cabinet_id: string, role = "responsable") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

function fd(client_id: string): FormData {
  const f = new FormData();
  f.set("client_id", client_id);
  return f;
}

describe("terminerOnboardingAction (F6d)", () => {
  test("refuse tant qu'aucun employé validé", async () => {
    acteur(cabinetA.id);
    const res = await terminerOnboardingAction({}, fd(clientA.id));
    expect(res.error).toMatch(/incomplet|employé/i);
  });

  test("RBAC : un lecteur ne peut pas terminer", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await terminerOnboardingAction({}, fd(clientA.id));
    expect(res.error).toMatch(/droits/i);
  });

  test("anti-fuite : un autre cabinet ne voit pas la session", async () => {
    acteur(cabinetB.id);
    const res = await terminerOnboardingAction({}, fd(clientA.id));
    expect(res.error).toMatch(/introuvable/i);
  });

  test("succès quand terminable (≥1 validé, 0 en attente)", async () => {
    await sql`UPDATE salaire.session_onboarding SET nb_employes_valides = 2 WHERE id = ${sessionA.id}`;
    acteur(cabinetA.id);
    const res = await terminerOnboardingAction({}, fd(clientA.id));
    expect(res.success).toBe(true);
    const [s] = await sql`SELECT statut FROM salaire.session_onboarding WHERE id = ${sessionA.id}`;
    expect(s?.statut).toBe("terminee");
  });
});
