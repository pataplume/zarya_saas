/**
 * Tests authentifiés — server actions des échéances (Bloc C3b).
 *
 * Transitions de statut (traiter / reporter / annuler) avec auth + scope cabinet + RBAC
 * réels (DB). @zarya/auth mocké ; next/cache stubé (alias). Couvre : RBAC lecteur,
 * anti-fuite cross-tenant, et les 3 transitions.
 *
 * Réf : calendar.md §6.3 ; tests/CLAUDE.md § server actions.
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

const {
  marquerTraiteeAction,
  annulerEcheanceAction,
  reporterEcheanceAction,
  creerEcheanceManuelleAction,
} = await import("../../../apps/web/app/(app)/app/calendrier/echeances/actions");

const sql = createServiceClient();

async function seedEcheance(cabinet_id: string, client_id: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.echeance (id, cabinet_id, client_id, type, libelle, date_echeance, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'tva', 'TVA Q1', CURRENT_DATE + 5, 'imminente')
  `;
  return id;
}

describe("Server actions échéances (C3b)", () => {
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
  });

  afterAll(async () => {
    await cleanupTestUsers(sql, responsable, lecteur);
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("RBAC : un lecteur ne peut pas traiter", async () => {
    const id = await seedEcheance(cabinetA.id, clientAId);
    authState.user = lecteur.authUser;
    const res = await marquerTraiteeAction(id);
    expect(res.error).toMatch(/droits/i);
    const [row] = await sql<{ statut: string }[]>`SELECT statut FROM crm.echeance WHERE id = ${id}`;
    expect(row?.statut).toBe("imminente");
  });

  test("anti-fuite : traiter une échéance d'un autre cabinet → introuvable", async () => {
    const idB = await seedEcheance(cabinetB.id, clientBId);
    authState.user = responsable.authUser;
    const res = await marquerTraiteeAction(idB);
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.echeance WHERE id = ${idB}`;
    expect(row?.statut).toBe("imminente");
  });

  test("traiter : statut → traitee + date_traitement", async () => {
    const id = await seedEcheance(cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await marquerTraiteeAction(id);
    expect(res.success).toBe(true);
    const [row] = await sql<{ statut: string; date_traitement: string | null }[]>`
      SELECT statut, date_traitement FROM crm.echeance WHERE id = ${id}
    `;
    expect(row?.statut).toBe("traitee");
    expect(row?.date_traitement).not.toBeNull();
  });

  test("annuler : statut → annulee", async () => {
    const id = await seedEcheance(cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    expect((await annulerEcheanceAction(id)).success).toBe(true);
    const [row] = await sql<{ statut: string }[]>`SELECT statut FROM crm.echeance WHERE id = ${id}`;
    expect(row?.statut).toBe("annulee");
  });

  test("reporter : statut → reportee + reporte_a + motif", async () => {
    const id = await seedEcheance(cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const fd = new FormData();
    fd.set("echeanceId", id);
    fd.set("reporteA", "2026-12-31");
    fd.set("motif", "Client en vacances");
    const res = await reporterEcheanceAction(fd);
    expect(res.success).toBe(true);
    const [row] = await sql<{ statut: string; reporte_a: string; motif_report: string }[]>`
      SELECT statut, to_char(reporte_a,'YYYY-MM-DD') AS reporte_a, motif_report
      FROM crm.echeance WHERE id = ${id}
    `;
    expect(row).toMatchObject({
      statut: "reportee",
      reporte_a: "2026-12-31",
      motif_report: "Client en vacances",
    });
  });

  // ─── Création manuelle (RUN4 usabilité) ──────────────────────────────────────────

  function fdCreerEcheance(over: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("client_id", over.client_id ?? clientAId);
    fd.set("libelle", over.libelle ?? "Dépôt statuts modifiés");
    fd.set("date_echeance", over.date_echeance ?? "2026-12-31");
    if (over.date_alerte !== undefined) fd.set("date_alerte", over.date_alerte);
    return fd;
  }

  test("création manuelle — RBAC : un lecteur ne peut pas créer", async () => {
    authState.user = lecteur.authUser;
    const res = await creerEcheanceManuelleAction({}, fdCreerEcheance());
    expect(res.error).toMatch(/droits/i);
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.echeance
      WHERE cabinet_id = ${cabinetA.id} AND libelle = 'Dépôt statuts modifiés'
    `;
    expect(row?.n).toBe(0);
  });

  test("création manuelle — anti-fuite : client d'un autre cabinet → introuvable", async () => {
    authState.user = responsable.authUser;
    const res = await creerEcheanceManuelleAction({}, fdCreerEcheance({ client_id: clientBId }));
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.echeance
      WHERE cabinet_id = ${cabinetA.id} AND libelle = 'Dépôt statuts modifiés'
    `;
    expect(row?.n).toBe(0);
  });

  test("création manuelle — nominal : crée une échéance personnalisée", async () => {
    authState.user = responsable.authUser;
    const res = await creerEcheanceManuelleAction(
      {},
      fdCreerEcheance({ libelle: "Dépôt statuts modifiés — nominal", date_alerte: "2026-12-15" }),
    );
    expect(res.success).toBe(true);
    const [row] = await sql<
      {
        type: string;
        libelle: string;
        date_echeance: string;
        date_alerte: string | null;
        statut: string;
      }[]
    >`
      SELECT type, libelle, to_char(date_echeance,'YYYY-MM-DD') AS date_echeance,
             to_char(date_alerte,'YYYY-MM-DD') AS date_alerte, statut
      FROM crm.echeance
      WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientAId}
        AND libelle = 'Dépôt statuts modifiés — nominal'
    `;
    expect(row).toMatchObject({
      type: "personnalisee",
      libelle: "Dépôt statuts modifiés — nominal",
      date_echeance: "2026-12-31",
      date_alerte: "2026-12-15",
      statut: "a_venir",
    });
  });

  test("création manuelle — libellé vide → erreur, rien en base", async () => {
    authState.user = responsable.authUser;
    const res = await creerEcheanceManuelleAction({}, fdCreerEcheance({ libelle: "" }));
    expect(res.error).toBeTruthy();
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.echeance
      WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientAId} AND libelle = ''
    `;
    expect(row?.n).toBe(0);
  });

  test("création manuelle — date malformée → erreur, rien en base", async () => {
    authState.user = responsable.authUser;
    const res = await creerEcheanceManuelleAction(
      {},
      fdCreerEcheance({ libelle: "Date invalide", date_echeance: "31-12-2026" }),
    );
    expect(res.error).toBeTruthy();
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.echeance
      WHERE cabinet_id = ${cabinetA.id} AND libelle = 'Date invalide'
    `;
    expect(row?.n).toBe(0);
  });
});
