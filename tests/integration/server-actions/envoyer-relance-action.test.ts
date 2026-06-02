/**
 * Tests authentifiés — server actions de la file des relances (Bloc C3a).
 *
 * Teste les VRAIES server actions (apps/web) : auth + scope cabinet + RBAC réels (DB),
 * l'envoi Graph (@zarya/calendar) étant mocké (déjà couvert en C2b). Couvre : RBAC
 * lecteur, anti-fuite cross-tenant, envoi nominal, lot avec ids hors cabinet ignorés,
 * modification scopée.
 *
 * Harness : @zarya/auth + @zarya/calendar mockés ; next/cache stubé (alias) ; db réelle.
 * Réf : tests/CLAUDE.md § server actions ; calendar.md §6.4.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
const calendarMock = vi.hoisted(() => ({
  envoyerRelance: vi.fn(async () => ({ status: "envoyee" as const })),
  envoyerRelancesValidees: vi.fn(async (ids: string[]) => ({
    traitees: ids.length,
    envoyees: ids.length,
    echecs: 0,
    plafonnees: false,
  })),
}));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));
vi.mock("@zarya/calendar", () => ({
  envoyerRelance: calendarMock.envoyerRelance,
  envoyerRelancesValidees: calendarMock.envoyerRelancesValidees,
}));

const { envoyerRelanceAction, envoyerLotAction, modifierRelanceAction } = await import(
  "../../../apps/web/app/(app)/app/calendrier/relances/actions"
);

const sql = createServiceClient();

async function seedBrouillon(cabinet_id: string, client_id: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.relance (id, cabinet_id, client_id, canal, sujet, corps, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'email', 'Rappel', 'Bonjour', 'brouillon')
  `;
  return id;
}

describe("Server actions file relances (C3a)", () => {
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

  afterEach(() => {
    authState.user = null;
    calendarMock.envoyerRelance.mockClear();
    calendarMock.envoyerRelancesValidees.mockClear();
  });

  afterAll(async () => {
    await cleanupTestUsers(sql, responsable, lecteur);
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("RBAC : un lecteur ne peut pas envoyer", async () => {
    const relanceId = await seedBrouillon(cabinetA.id, clientAId);
    authState.user = lecteur.authUser;
    const res = await envoyerRelanceAction(relanceId);
    expect(res.error).toMatch(/droits/i);
    expect(calendarMock.envoyerRelance).not.toHaveBeenCalled();
  });

  test("anti-fuite : envoyer une relance d'un autre cabinet → introuvable", async () => {
    const relanceB = await seedBrouillon(cabinetB.id, clientBId);
    authState.user = responsable.authUser;
    const res = await envoyerRelanceAction(relanceB);
    expect(res.error).toMatch(/introuvable/i);
    expect(calendarMock.envoyerRelance).not.toHaveBeenCalled();
  });

  test("envoi nominal : brouillon du cabinet → appelle envoyerRelance, succès", async () => {
    const relanceId = await seedBrouillon(cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await envoyerRelanceAction(relanceId);
    expect(res.success).toBe(true);
    expect(calendarMock.envoyerRelance).toHaveBeenCalledWith(relanceId);
  });

  test("lot : les ids hors cabinet sont ignorés (comptés)", async () => {
    const a1 = await seedBrouillon(cabinetA.id, clientAId);
    const a2 = await seedBrouillon(cabinetA.id, clientAId);
    const b1 = await seedBrouillon(cabinetB.id, clientBId);
    authState.user = responsable.authUser;
    const res = await envoyerLotAction([a1, a2, b1]);
    expect(res.ignores).toBe(1);
    const passed = calendarMock.envoyerRelancesValidees.mock.calls[0]?.[0] as string[];
    expect(passed.sort()).toEqual([a1, a2].sort());
  });

  test("modifier : met à jour sujet/corps d'un brouillon scopé", async () => {
    const relanceId = await seedBrouillon(cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const fd = new FormData();
    fd.set("relanceId", relanceId);
    fd.set("sujet", "Nouveau sujet");
    fd.set("corps", "Nouveau corps");
    const res = await modifierRelanceAction(fd);
    expect(res.success).toBe(true);
    const [row] = await sql<{ sujet: string; corps: string }[]>`
      SELECT sujet, corps FROM crm.relance WHERE id = ${relanceId}
    `;
    expect(row).toMatchObject({ sujet: "Nouveau sujet", corps: "Nouveau corps" });
  });
});
