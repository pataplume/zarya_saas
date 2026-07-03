/**
 * Tests authentifiés — server actions de l'écran conformité (RGPD, RUN 6).
 *
 * Changement de statut d'une demande RGPD (crm.demande_suppression) + ajout de note
 * (tracée dans crm.evenement). Sujet sensible : RBAC restreint au rôle responsable
 * (comme /parametres/integrations). @zarya/auth mocké ; next/cache stubé (alias).
 * Couvre : RBAC non-responsable rejeté, anti-fuite cross-cabinet, nominal.
 *
 * Réf : tests/CLAUDE.md § server actions ; docs droits-personnes.md.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDemandeSuppression,
  seedTwoCabinets,
  type TestCabinet,
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

const { changerStatutDemandeAction, ajouterNoteDemandeAction } = await import(
  "../../../apps/web/app/(app)/app/parametres/conformite/actions"
);

const sql = createServiceClient();

function fdStatut(demandeId: string, statut: string): FormData {
  const fd = new FormData();
  fd.set("demandeId", demandeId);
  fd.set("statut", statut);
  return fd;
}

function fdNote(demandeId: string, note: string): FormData {
  const fd = new FormData();
  fd.set("demandeId", demandeId);
  fd.set("note", note);
  return fd;
}

describe("Server actions conformité RGPD (RUN 6)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientAId: string;
  let clientBId: string;
  let responsable: Awaited<ReturnType<typeof createTestUser>>;
  let collaborateur: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientAId = (await seedClient(sql, cabinetA.id)).id;
    clientBId = (await seedClient(sql, cabinetB.id)).id;
    responsable = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    collaborateur = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
  });

  afterEach(() => {
    authState.user = null;
  });

  afterAll(async () => {
    await cleanupTestUsers(sql, responsable, collaborateur);
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── changerStatutDemandeAction ──────────────────────────────────────────────

  test("RBAC : un collaborateur ne peut pas changer le statut", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = collaborateur.authUser;
    const res = await changerStatutDemandeAction({}, fdStatut(id, "en_cours"));
    expect(res.error).toMatch(/responsable/i);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.demande_suppression WHERE id = ${id}`;
    expect(row?.statut).toBe("nouvelle");
  });

  test("anti-fuite : changer le statut d'une demande d'un autre cabinet → introuvable", async () => {
    const { id: idB } = await seedDemandeSuppression(sql, cabinetB.id, clientBId);
    authState.user = responsable.authUser;
    const res = await changerStatutDemandeAction({}, fdStatut(idB, "en_cours"));
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.demande_suppression WHERE id = ${idB}`;
    expect(row?.statut).toBe("nouvelle");
  });

  test("nominal : statut mis à jour + événement crm.evenement", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await changerStatutDemandeAction({}, fdStatut(id, "en_cours"));
    expect(res.success).toBe(true);

    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.demande_suppression WHERE id = ${id}`;
    expect(row?.statut).toBe("en_cours");

    const [ev] = await sql<
      { type: string; ressource_type: string; ressource_id: string; metadata: unknown }[]
    >`
      SELECT type, ressource_type, ressource_id, metadata
      FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_id = ${id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(ev).toMatchObject({
      type: "note_ajoutee",
      ressource_type: "crm.demande_suppression",
      ressource_id: id,
    });
    expect(ev?.metadata).toMatchObject({
      contexte: "demande_rgpd_statut",
      ancien_statut: "nouvelle",
      nouveau_statut: "en_cours",
    });
  });

  test("statut invalide (hors enum) → erreur, rien en base", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await changerStatutDemandeAction({}, fdStatut(id, "statut_inexistant"));
    expect(res.error).toBeTruthy();
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.demande_suppression WHERE id = ${id}`;
    expect(row?.statut).toBe("nouvelle");
  });

  // ─── ajouterNoteDemandeAction ────────────────────────────────────────────────

  test("note — RBAC : un collaborateur ne peut pas ajouter de note", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = collaborateur.authUser;
    const res = await ajouterNoteDemandeAction({}, fdNote(id, "Une note"));
    expect(res.error).toMatch(/responsable/i);
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_id = ${id}
    `;
    expect(row?.n).toBe(0);
  });

  test("note — anti-fuite : demande d'un autre cabinet → introuvable", async () => {
    const { id: idB } = await seedDemandeSuppression(sql, cabinetB.id, clientBId);
    authState.user = responsable.authUser;
    const res = await ajouterNoteDemandeAction({}, fdNote(idB, "Une note"));
    expect(res.error).toMatch(/introuvable/i);
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE ressource_id = ${idB}
    `;
    expect(row?.n).toBe(0);
  });

  test("note — nominal : événement créé avec la note en metadata", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await ajouterNoteDemandeAction({}, fdNote(id, "Client recontacté le 02/07."));
    expect(res.success).toBe(true);

    const [ev] = await sql<{ type: string; ressource_type: string; metadata: { note?: string } }[]>`
      SELECT type, ressource_type, metadata
      FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_id = ${id}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(ev).toMatchObject({ type: "note_ajoutee", ressource_type: "crm.demande_suppression" });
    expect(ev?.metadata).toMatchObject({
      contexte: "demande_rgpd_note",
      note: "Client recontacté le 02/07.",
    });
  });

  test("note — vide → erreur, rien en base", async () => {
    const { id } = await seedDemandeSuppression(sql, cabinetA.id, clientAId);
    authState.user = responsable.authUser;
    const res = await ajouterNoteDemandeAction({}, fdNote(id, "   "));
    expect(res.error).toBeTruthy();
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE cabinet_id = ${cabinetA.id} AND ressource_id = ${id}
    `;
    expect(row?.n).toBe(0);
  });
});
