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
  genererBrouillonsRelances: vi.fn(async () => ({
    candidats: 0,
    brouillons_crees: 0,
    sans_modele: 0,
    sans_destinataire: 0,
  })),
  escaladerRelances: vi.fn(async () => ({
    candidats: 0,
    brouillons_crees: 0,
    arretees_max: 0,
    sans_modele: 0,
    sans_destinataire: 0,
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
  genererBrouillonsRelances: calendarMock.genererBrouillonsRelances,
  escaladerRelances: calendarMock.escaladerRelances,
}));

const {
  envoyerRelanceAction,
  envoyerLotAction,
  modifierRelanceAction,
  genererRelancesManuelAction,
} = await import("../../../apps/web/app/(app)/app/calendrier/relances/actions");

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

  afterEach(async () => {
    authState.user = null;
    calendarMock.envoyerRelance.mockClear();
    calendarMock.envoyerRelancesValidees.mockClear();
    calendarMock.genererBrouillonsRelances.mockClear();
    calendarMock.escaladerRelances.mockClear();
    // Nettoyage des événements de cooldown créés par genererRelancesManuelAction (les deux
    // cabinets, pour ne pas polluer les tests suivants ni laisser fuiter entre cas).
    await sql`
      DELETE FROM crm.evenement
      WHERE cabinet_id IN (${cabinetA.id}, ${cabinetB.id})
        AND metadata->>'action' = 'generation_manuelle_relances'
    `;
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
    // 1er argument = relanceId ; le 2e (opts signature) dépend du membre acteur (ici sans
    // signature → {}). On vérifie l'identifiant, pas la forme exacte des opts.
    expect(calendarMock.envoyerRelance.mock.calls[0]?.[0]).toBe(relanceId);
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

  // ─── Déclenchement manuel de la génération (RUN5 usabilité, arbitrage A8) ────────────────

  async function countEvenementsGeneration(cabinet_id: string): Promise<number> {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE cabinet_id = ${cabinet_id}
        AND type = 'note_ajoutee'
        AND metadata->>'action' = 'generation_manuelle_relances'
    `;
    return row?.n ?? 0;
  }

  test("génération manuelle — RBAC : un lecteur ne peut pas déclencher", async () => {
    authState.user = lecteur.authUser;
    const res = await genererRelancesManuelAction();
    expect(res.error).toMatch(/droits/i);
    expect(calendarMock.genererBrouillonsRelances).not.toHaveBeenCalled();
    expect(calendarMock.escaladerRelances).not.toHaveBeenCalled();
    expect(await countEvenementsGeneration(cabinetA.id)).toBe(0);
  });

  test("génération manuelle — nominal : sans échéance due, 0 brouillon + événement tracé", async () => {
    authState.user = responsable.authUser;
    const res = await genererRelancesManuelAction();
    expect(res.success).toBe(true);
    expect(res.brouillonsCrees).toBe(0);
    expect(calendarMock.genererBrouillonsRelances).toHaveBeenCalledWith({ cabinetId: cabinetA.id });
    expect(calendarMock.escaladerRelances).toHaveBeenCalledWith({ cabinetId: cabinetA.id });
    expect(await countEvenementsGeneration(cabinetA.id)).toBe(1);
  });

  test("génération manuelle — cooldown : un 2e déclenchement immédiat est bloqué", async () => {
    authState.user = responsable.authUser;
    const premier = await genererRelancesManuelAction();
    expect(premier.success).toBe(true);
    calendarMock.genererBrouillonsRelances.mockClear();
    calendarMock.escaladerRelances.mockClear();

    const second = await genererRelancesManuelAction();
    expect(second.error).toMatch(/réessayez/i);
    expect(second.success).toBeUndefined();
    expect(calendarMock.genererBrouillonsRelances).not.toHaveBeenCalled();
    expect(calendarMock.escaladerRelances).not.toHaveBeenCalled();
    // Aucun nouvel événement — un seul créé par le 1er déclenchement.
    expect(await countEvenementsGeneration(cabinetA.id)).toBe(1);
  });

  test("génération manuelle — anti-fuite : le cooldown du cabinet A ne bloque pas le cabinet B", async () => {
    authState.user = responsable.authUser;
    const premier = await genererRelancesManuelAction();
    expect(premier.success).toBe(true);

    const gestionnaireB = await createTestUser(sql, {
      cabinet_id: cabinetB.id,
      role: "responsable",
    });
    try {
      authState.user = gestionnaireB.authUser;
      const res = await genererRelancesManuelAction();
      expect(res.success).toBe(true);
      expect(calendarMock.genererBrouillonsRelances).toHaveBeenCalledWith({
        cabinetId: cabinetB.id,
      });
      expect(await countEvenementsGeneration(cabinetB.id)).toBe(1);
    } finally {
      await cleanupTestUsers(sql, gestionnaireB);
    }
  });
});
