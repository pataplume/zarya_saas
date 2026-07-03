/**
 * Tests authentifiés — snooze persistant des relances salaire (RUN6 usabilité, migration 0055).
 *
 * Symétrique à `snoozerRelanceAction` (module Calendar, cf. envoyer-relance-action.test.ts) :
 * teste la VRAIE server action `snoozerRelanceSalaireAction` (apps/web) contre la base de
 * test, auth + scope cabinet + RBAC réels (DB). `@zarya/extraction` est mocké (pas d'envoi
 * Graph impliqué par cette action, mais le module est importé transitivement par actions.ts).
 *
 * Harness : @zarya/auth mocké ; next/cache stubé (alias) ; db réelle.
 * Réf : tests/CLAUDE.md § server actions.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));
vi.mock("@zarya/extraction", () => ({
  envoyerRelanceSalaire: vi.fn(async () => ({ status: "envoyee" as const })),
}));

const { snoozerRelanceSalaireAction } = await import(
  "../../../apps/web/app/(app)/app/salaire/relances/actions"
);

const sql = createServiceClient();

// mois distinct par appel : la contrainte unique (client_id, annee, mois) interdit deux
// périodes du même mois pour un même client — les tests réutilisent le même clientAId.
async function seedPeriode(cabinet_id: string, client_id: string, mois: number): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 2026, ${mois}, CURRENT_DATE, 'en_attente')
  `;
  return id;
}

async function seedRelanceSalaire(
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO salaire.relance (id, cabinet_id, client_id, periode_id, numero, sujet, corps, valide_par_humain)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${periode_id}, 1, 'Rappel salaires', 'Bonjour', false)
  `;
  return id;
}

describe("Server actions — snooze relances salaire (RUN6)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientAId: string;
  let clientBId: string;
  let responsable: Awaited<ReturnType<typeof createTestUser>>;
  let lecteur: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientAId = (await seedClient(sql, cabinetA.id)).id;
    clientBId = (await seedClient(sql, cabinetB.id)).id;
    responsable = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    lecteur = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
  });

  afterEach(async () => {
    authState.user = null;
  });

  afterAll(async () => {
    await cleanupTestUsers(sql, responsable, lecteur);
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  async function getSnoozedUntil(relanceId: string): Promise<Date | null> {
    const [row] = await sql<{ snoozed_until: Date | null }[]>`
      SELECT snoozed_until FROM salaire.relance WHERE id = ${relanceId}
    `;
    return row?.snoozed_until ?? null;
  }

  test("RBAC : un lecteur ne peut pas reporter", async () => {
    const periodeId = await seedPeriode(cabinetA.id, clientAId, 1);
    const relanceId = await seedRelanceSalaire(cabinetA.id, clientAId, periodeId);
    authState.user = lecteur.authUser;
    const res = await snoozerRelanceSalaireAction(relanceId, 1);
    expect(res.error).toMatch(/droits/i);
    expect(await getSnoozedUntil(relanceId)).toBeNull();
  });

  test("anti-fuite : reporter une relance d'un autre cabinet → introuvable", async () => {
    const periodeId = await seedPeriode(cabinetB.id, clientBId, 2);
    const relanceB = await seedRelanceSalaire(cabinetB.id, clientBId, periodeId);
    authState.user = responsable.authUser;
    const res = await snoozerRelanceSalaireAction(relanceB, 1);
    expect(res.error).toMatch(/introuvable/i);
    expect(await getSnoozedUntil(relanceB)).toBeNull();
  });

  test("nominal : pose snoozed_until ~N jours dans le futur", async () => {
    const periodeId = await seedPeriode(cabinetA.id, clientAId, 3);
    const relanceId = await seedRelanceSalaire(cabinetA.id, clientAId, periodeId);
    authState.user = responsable.authUser;
    const res = await snoozerRelanceSalaireAction(relanceId, 2);
    expect(res.success).toBe(true);

    const snoozedUntil = await getSnoozedUntil(relanceId);
    expect(snoozedUntil).not.toBeNull();
    const attendu = Date.now() + 2 * 24 * 60 * 60 * 1000;
    expect(Math.abs((snoozedUntil as Date).getTime() - attendu)).toBeLessThan(60_000);
  });

  test("paramètre jours hors bornes rejeté (Zod)", async () => {
    const periodeId = await seedPeriode(cabinetA.id, clientAId, 4);
    const relanceId = await seedRelanceSalaire(cabinetA.id, clientAId, periodeId);
    authState.user = responsable.authUser;
    const res = await snoozerRelanceSalaireAction(relanceId, 0);
    expect(res.error).toMatch(/invalides/i);
    expect(await getSnoozedUntil(relanceId)).toBeNull();
  });
});
