/**
 * Tests authentifiés — rejeterPropositionAction (Phase 3.6).
 *
 * Même architecture que valider-proposition.test.ts :
 * - `@zarya/auth` mocké : `requireAuth()` renvoie l'utilisateur de test courant ;
 * - `next/cache` stubé via alias vitest.config.ts (revalidatePath hors scope requête).
 *
 * Le reste (db service role, Zod) est réel et frappe la base de test. Le rejet ne
 * crée AUCUN doc.document : il passe la proposition à `rejete`, enregistre le motif,
 * et répercute le statut sur l'upload (inbox). Couvre : chemin nominal, RBAC
 * (lecteur), isolation cross-tenant, erreur Zod.
 *
 * Références : flow-doc-validation.md § Étape 4 ; HANDOFF_V2.md § 5.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  seedUploadBrut,
  type TestCabinet,
} from "../helpers/seed";

// État d'auth injectable, lu par le mock de requireAuth (hoisté avant les imports).
const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));
// next/cache est neutralisé via un alias vitest.config.ts → stub no-op.

const { rejeterPropositionAction } = await import(
  "../../../apps/web/app/(app)/app/documents/validation/actions"
);

const sql = createServiceClient();

describe("rejeterPropositionAction (authentifié)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
  });

  afterEach(() => {
    authState.user = null;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  /** Crée la chaîne upload → fichier → proposition (a_valider) dans un cabinet. */
  async function seedPropositionChain(cabinet_id: string, uploaded_par: string) {
    const upload = await seedUploadBrut(sql, cabinet_id, uploaded_par);
    const fichier = await seedFichierPhysique(sql, cabinet_id, upload.id);
    const prop = await seedProposition(sql, cabinet_id, fichier.id);
    return { upload, fichier, prop };
  }

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  test("chemin nominal : passe proposition + upload à rejeté, aucun document créé", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const { upload, prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await rejeterPropositionAction(
      {},
      formData({ proposition_id: prop.id, motif: "Document illisible" }),
    );

    expect(result).toEqual({ success: true });

    const [p] = await sql`
      SELECT statut, rejet_motif, valide_par, document_id
      FROM doc.proposition_classement WHERE id = ${prop.id}
    `;
    expect(p?.statut).toBe("rejete");
    expect(p?.rejet_motif).toBe("Document illisible");
    expect(p?.valide_par).toBe(user.id);
    expect(p?.document_id).toBeNull();

    const [u] = await sql`SELECT statut FROM doc.upload_brut WHERE id = ${upload.id}`;
    expect(u?.statut).toBe("rejete");

    const docs = await sql`SELECT 1 FROM doc.document WHERE proposition_classement_id = ${prop.id}`;
    expect(docs).toHaveLength(0);

    await cleanupTestUsers(sql, user);
  });

  test("motif optionnel : rejet sans motif accepté", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await rejeterPropositionAction({}, formData({ proposition_id: prop.id }));

    expect(result).toEqual({ success: true });
    const [p] = await sql`
      SELECT statut, rejet_motif FROM doc.proposition_classement WHERE id = ${prop.id}
    `;
    expect(p?.statut).toBe("rejete");
    expect(p?.rejet_motif).toBeNull();

    await cleanupTestUsers(sql, user);
  });

  test("rôle lecteur : refusé, proposition inchangée", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await rejeterPropositionAction(
      {},
      formData({ proposition_id: prop.id, motif: "Tentative lecteur" }),
    );

    expect(result.error).toMatch(/rôle/i);
    const [p] = await sql`SELECT statut FROM doc.proposition_classement WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("a_valider");

    await cleanupTestUsers(sql, user);
  });

  test("isolation : un user du cabinet B ne peut pas rejeter une proposition du cabinet A", async () => {
    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    const userB = await createTestUser(sql, { cabinet_id: cabinetB.id, role: "collaborateur" });
    const { prop } = await seedPropositionChain(cabinetA.id, userA.id);

    authState.user = userB.authUser;
    const result = await rejeterPropositionAction(
      {},
      formData({ proposition_id: prop.id, motif: "Cross-tenant" }),
    );

    // Scopé cabinet B → proposition de A introuvable, statut inchangé.
    expect(result.error).toMatch(/introuvable/i);
    const [p] = await sql`SELECT statut FROM doc.proposition_classement WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("a_valider");

    await cleanupTestUsers(sql, userA, userB);
  });

  test("Zod : proposition_id non-uuid → erreur de validation, aucun rejet", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await rejeterPropositionAction({}, formData({ proposition_id: "pas-un-uuid" }));

    expect(result.error).toMatch(/invalides/i);
    const [p] = await sql`SELECT statut FROM doc.proposition_classement WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("a_valider");

    await cleanupTestUsers(sql, user);
  });
});
