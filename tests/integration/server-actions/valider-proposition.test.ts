/**
 * Tests authentifiés — validerPropositionAction (Phase 3.6).
 *
 * On teste la VRAIE server action (apps/web), avec :
 * - `@zarya/auth` mocké : `requireAuth()` renvoie l'utilisateur de test courant
 *   (le contexte JWT réel n'existe pas hors d'une requête Next) ;
 * - `next/cache` stubé via alias vitest.config.ts : `revalidatePath()` exige un
 *   scope de requête, inexistant sous Vitest.
 *
 * Le reste (db service role, trigger doc.fn_check_client_cabinet, Zod) est réel et
 * frappe la base de test. Couvre : chemin nominal, RBAC (lecteur), isolation
 * cross-tenant (chemin app + trigger DB), erreurs Zod.
 *
 * Références : flow-doc-validation.md § Étape 4 ; HANDOFF_V2.md § 5.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  seedUploadBrut,
  type TestCabinet,
  type TestClient,
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
// next/cache est neutralisé via un alias vitest.config.ts → stub no-op
// (revalidatePath lève hors d'un scope de requête Next).

const { validerPropositionAction } = await import(
  "../../../apps/web/app/(app)/app/documents/validation/actions"
);

const sql = createServiceClient();

describe("validerPropositionAction (authentifié)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
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

  test("chemin nominal : crée le doc.document, passe proposition + upload à validé", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const { upload, fichier, prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientA.id,
        type: "facture",
        categorie: "commercial",
        periode: "2026-04",
        libelle: "Facture Swisscom avril 2026",
      }),
    );

    expect(result).toEqual({ success: true });

    const [doc] = await sql`
      SELECT id, cabinet_id, client_id, fichier_physique_id, proposition_classement_id,
             statut_classement, cree_par
      FROM doc.document WHERE proposition_classement_id = ${prop.id}
    `;
    expect(doc?.cabinet_id).toBe(cabinetA.id);
    expect(doc?.client_id).toBe(clientA.id);
    expect(doc?.fichier_physique_id).toBe(fichier.id);
    // Proposition vide remplie par l'humain → corrigé.
    expect(doc?.statut_classement).toBe("corrige_humain");
    expect(doc?.cree_par).toBe(user.id);

    const [p] = await sql`
      SELECT statut, document_id, valide_par FROM doc.proposition_classement WHERE id = ${prop.id}
    `;
    expect(p?.statut).toBe("valide");
    expect(p?.document_id).toBe(doc?.id);
    expect(p?.valide_par).toBe(user.id);

    const [u] = await sql`SELECT statut FROM doc.upload_brut WHERE id = ${upload.id}`;
    expect(u?.statut).toBe("valide");

    await cleanupTestUsers(sql, user);
  });

  test("rôle lecteur : refusé, aucun document créé", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientA.id,
        type: "facture",
        categorie: "commercial",
        libelle: "Tentative lecteur",
      }),
    );

    expect(result.error).toMatch(/rôle/i);
    const rows = await sql`SELECT 1 FROM doc.document WHERE proposition_classement_id = ${prop.id}`;
    expect(rows).toHaveLength(0);

    await cleanupTestUsers(sql, user);
  });

  test("isolation : un user du cabinet B ne peut pas valider une proposition du cabinet A", async () => {
    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    const userB = await createTestUser(sql, { cabinet_id: cabinetB.id, role: "collaborateur" });
    const { prop } = await seedPropositionChain(cabinetA.id, userA.id);

    authState.user = userB.authUser;
    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: clientB.id,
        type: "facture",
        categorie: "commercial",
        libelle: "Cross-tenant",
      }),
    );

    // Scopé cabinet B → proposition de A introuvable, aucun document.
    expect(result.error).toMatch(/introuvable/i);
    const rows = await sql`SELECT 1 FROM doc.document WHERE proposition_classement_id = ${prop.id}`;
    expect(rows).toHaveLength(0);

    await cleanupTestUsers(sql, userA, userB);
  });

  test("trigger DB : attribuer un client d'un autre cabinet est rejeté", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "responsable" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    // client_id appartient au cabinet B → doc.fn_check_client_cabinet doit lever.
    await expect(
      validerPropositionAction(
        {},
        formData({
          proposition_id: prop.id,
          client_id: clientB.id,
          type: "facture",
          categorie: "commercial",
          libelle: "Client d'un autre cabinet",
        }),
      ),
    ).rejects.toThrow();

    await cleanupTestUsers(sql, user);
  });

  test("Zod : client_id vide → erreur de validation, aucun document", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const { prop } = await seedPropositionChain(cabinetA.id, user.id);

    // Un <select> non renseigné soumet une chaîne vide (pas null) → message uuid custom.
    const result = await validerPropositionAction(
      {},
      formData({
        proposition_id: prop.id,
        client_id: "",
        type: "facture",
        categorie: "commercial",
        libelle: "Sans client",
      }),
    );

    expect(result.error).toMatch(/client/i);
    const rows = await sql`SELECT 1 FROM doc.document WHERE proposition_classement_id = ${prop.id}`;
    expect(rows).toHaveLength(0);

    await cleanupTestUsers(sql, user);
  });
});
