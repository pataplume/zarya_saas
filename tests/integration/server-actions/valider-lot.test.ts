/**
 * Tests authentifiés — validerLotAction + note interne (Bloc B7).
 *
 * On teste les VRAIES server actions (apps/web) du flux de validation B7 :
 * - `validerLotAction` : validation 1-clic / en lot des valeurs PROPOSÉES telles
 *   quelles (doc.md §7.2 & §7.4). Une proposition incomplète (sans client, type ou
 *   libellé proposé) est ignorée ; les ids hors cabinet / déjà traités aussi.
 * - `validerPropositionAction` avec note : la « note interne = feedback » (doc.md
 *   §7.3) est repliée sous la clé `note_interne` de `corrections_apportees`.
 *
 * Harness identique à valider-proposition.test.ts : `@zarya/auth` mocké, `next/cache`
 * stubé via alias ; db service role + triggers DB + Zod réels. Couvre : lot nominal,
 * skip-incomplet, anti-fuite cross-tenant, RBAC, stockage note_interne.
 *
 * Références : KICKOFF § BLOC B / B7 ; docs/modules/doc.md §7 ; tests/CLAUDE.md § server actions.
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedTwoCabinets,
  seedUploadBrut,
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

const { validerLotAction, validerPropositionAction } = await import(
  "../../../apps/web/app/(app)/app/documents/validation/actions"
);

const sql = createServiceClient();

// Seed une proposition 'a_valider' avec des champs proposés contrôlés (le helper
// partagé seedProposition crée une proposition vide ; le lot a besoin de valeurs).
async function seedPropositionProposee(
  cabinet_id: string,
  fichier_physique_id: string,
  champs: {
    client_id_propose: string | null;
    type_propose: string | null;
    categorie_proposee: string | null;
    periode_proposee: string | null;
    libelle_propose: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO doc.proposition_classement
      (id, cabinet_id, fichier_physique_id, statut, client_id_propose,
       type_propose, categorie_proposee, periode_proposee, libelle_propose, confiance_globale)
    VALUES (
      ${id}, ${cabinet_id}, ${fichier_physique_id}, 'a_valider', ${champs.client_id_propose},
      ${champs.type_propose}, ${champs.categorie_proposee}, ${champs.periode_proposee},
      ${champs.libelle_propose}, '0.80'
    )
  `;
  return id;
}

describe("validerLotAction + note interne (authentifié, B7)", () => {
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

  /** Chaîne upload → fichier (lié) → proposition proposée, dans un cabinet. */
  async function seedChain(
    cabinet_id: string,
    uploaded_par: string,
    champs: Parameters<typeof seedPropositionProposee>[2],
  ) {
    const upload = await seedUploadBrut(sql, cabinet_id, uploaded_par);
    const fichier = await seedFichierPhysique(sql, cabinet_id, upload.id);
    const propId = await seedPropositionProposee(cabinet_id, fichier.id, champs);
    return { upload, fichier, propId };
  }

  function champsComplets(client_id: string) {
    return {
      client_id_propose: client_id,
      type_propose: "facture",
      categorie_proposee: "commercial",
      periode_proposee: "2026-04",
      libelle_propose: "Facture Swisscom",
    };
  }

  test("lot nominal : deux propositions complètes → 2 documents, propositions + uploads validés", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;

    const a = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));
    const b = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));

    const result = await validerLotAction([a.propId, b.propId]);
    expect(result).toEqual({ valides: 2, ignores: 0 });

    for (const c of [a, b]) {
      const [doc] = await sql`
        SELECT client_id, statut_classement FROM doc.document
        WHERE proposition_classement_id = ${c.propId}
      `;
      expect(doc?.client_id).toBe(clientA.id);
      // Valeurs proposées appliquées telles quelles → pas de correction.
      expect(doc?.statut_classement).toBe("valide_humain");

      const [p] = await sql`
        SELECT statut, valide_par FROM doc.proposition_classement WHERE id = ${c.propId}
      `;
      expect(p?.statut).toBe("valide");
      expect(p?.valide_par).toBe(user.id);

      const [u] = await sql`SELECT statut FROM doc.upload_brut WHERE id = ${c.upload.id}`;
      expect(u?.statut).toBe("valide");
    }

    await cleanupTestUsers(sql, user);
  });

  test("lot : une proposition sans client proposé est ignorée (reste a_valider)", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;

    const complet = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));
    const incomplet = await seedChain(cabinetA.id, user.id, {
      client_id_propose: null, // pas de client → non validable à l'aveugle
      type_propose: "facture",
      categorie_proposee: "commercial",
      periode_proposee: null,
      libelle_propose: "Sans client",
    });

    const result = await validerLotAction([complet.propId, incomplet.propId]);
    expect(result).toEqual({ valides: 1, ignores: 1 });

    const [pOk] = await sql`
      SELECT statut FROM doc.proposition_classement WHERE id = ${complet.propId}
    `;
    expect(pOk?.statut).toBe("valide");

    const [pSkip] = await sql`
      SELECT statut FROM doc.proposition_classement WHERE id = ${incomplet.propId}
    `;
    expect(pSkip?.statut).toBe("a_valider");
    const orphan = await sql`
      SELECT 1 FROM doc.document WHERE proposition_classement_id = ${incomplet.propId}
    `;
    expect(orphan).toHaveLength(0);

    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : un id du cabinet B passé par un user A est ignoré, la prop de B intacte", async () => {
    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    const userB = await createTestUser(sql, { cabinet_id: cabinetB.id, role: "collaborateur" });

    const propA = await seedChain(cabinetA.id, userA.id, champsComplets(clientA.id));
    const propB = await seedChain(cabinetB.id, userB.id, champsComplets(clientB.id));

    authState.user = userA.authUser;
    const result = await validerLotAction([propA.propId, propB.propId]);

    // Scopé cabinet A : la prop de B est hors périmètre → comptée en ignorée, non validée.
    expect(result).toEqual({ valides: 1, ignores: 1 });

    const [pB] = await sql`
      SELECT statut FROM doc.proposition_classement WHERE id = ${propB.propId}
    `;
    expect(pB?.statut).toBe("a_valider");
    const leak = await sql`
      SELECT 1 FROM doc.document WHERE proposition_classement_id = ${propB.propId}
    `;
    expect(leak).toHaveLength(0);

    await cleanupTestUsers(sql, userA, userB);
  });

  test("RBAC : un lecteur ne peut pas valider en lot", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const c = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));

    const result = await validerLotAction([c.propId]);
    expect(result.error).toMatch(/rôle/i);

    const [p] = await sql`
      SELECT statut FROM doc.proposition_classement WHERE id = ${c.propId}
    `;
    expect(p?.statut).toBe("a_valider");

    await cleanupTestUsers(sql, user);
  });

  test("note interne : repliée dans corrections_apportees.note_interne (sans correction de champ)", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const c = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));

    const fd = new FormData();
    fd.set("proposition_id", c.propId);
    fd.set("client_id", clientA.id);
    fd.set("type", "facture");
    fd.set("categorie", "commercial");
    fd.set("periode", "2026-04");
    fd.set("libelle", "Facture Swisscom");
    fd.set("note", "Fournisseur récurrent, classer en commercial.");

    const result = await validerPropositionAction({}, fd);
    expect(result).toEqual({ success: true });

    const [p] = await sql`
      SELECT corrections_apportees FROM doc.proposition_classement WHERE id = ${c.propId}
    `;
    // Aucun champ corrigé → seule la note interne est présente.
    expect(p?.corrections_apportees).toMatchObject({
      note_interne: "Fournisseur récurrent, classer en commercial.",
    });

    await cleanupTestUsers(sql, user);
  });

  test("note interne : coexiste avec les corrections de champ", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const c = await seedChain(cabinetA.id, user.id, champsComplets(clientA.id));

    const fd = new FormData();
    fd.set("proposition_id", c.propId);
    fd.set("client_id", clientA.id);
    fd.set("type", "facture");
    fd.set("categorie", "fiscal"); // correction (proposé: commercial)
    fd.set("periode", "2026-04");
    fd.set("libelle", "Facture Swisscom");
    fd.set("note", "Reclassé en fiscal.");

    const result = await validerPropositionAction({}, fd);
    expect(result).toEqual({ success: true });

    const [p] = await sql`
      SELECT corrections_apportees, statut FROM doc.proposition_classement WHERE id = ${c.propId}
    `;
    expect(p?.statut).toBe("valide");
    expect(p?.corrections_apportees).toMatchObject({
      categorie: { propose: "commercial", retenu: "fiscal" },
      note_interne: "Reclassé en fiscal.",
    });

    const [doc] = await sql`
      SELECT statut_classement FROM doc.document WHERE proposition_classement_id = ${c.propId}
    `;
    expect(doc?.statut_classement).toBe("corrige_humain");

    await cleanupTestUsers(sql, user);
  });
});
