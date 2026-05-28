/**
 * Tests d'isolation multi-tenant — module Doc (Sprint 3.1)
 *
 * Couvre les nouvelles tables métier :
 *   crm.client, extraction.invocation, doc.upload_brut, doc.fichier_physique,
 *   doc.proposition_classement, doc.document.
 *
 * Policies standard : 4 opérations filtrent sur current_cabinet_id() (style 0001/0002).
 * Vérifie aussi le trigger de cohérence cabinet/client (multi-tenant.md § 7).
 *
 * Références :
 * - packages/db/migrations/0004_doc_module.sql
 * - docs/architecture/multi-tenant.md § 5 et § 7
 * - tests/CLAUDE.md § "Multi-tenant isolation (bloquants)"
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedFichierPhysique,
  seedInvocation,
  seedProposition,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
  type TestDocument,
  type TestFichierPhysique,
  type TestInvocation,
  type TestProposition,
} from "../helpers/seed";

describe("Multi-tenant isolation — module Doc", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let fichierA: TestFichierPhysique;
  let _fichierB: TestFichierPhysique;
  let invocationB: TestInvocation;
  let _propositionA: TestProposition;
  let propositionB: TestProposition;
  let _documentA: TestDocument;
  let documentB: TestDocument;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;

    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);

    fichierA = await seedFichierPhysique(sql, cabinetA.id);
    _fichierB = await seedFichierPhysique(sql, cabinetB.id);

    await seedInvocation(sql, cabinetA.id);
    invocationB = await seedInvocation(sql, cabinetB.id);

    _propositionA = await seedProposition(sql, cabinetA.id, fichierA.id);
    propositionB = await seedProposition(sql, cabinetB.id, _fichierB.id);

    _documentA = await seedDocument(sql, cabinetA.id, clientA.id, fichierA.id);
    documentB = await seedDocument(sql, cabinetB.id, clientB.id, _fichierB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── crm.client ──────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres clients (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.client`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  test("tenant A ne peut pas lire le client du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.client WHERE id = ${clientB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas insérer un client pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.client (cabinet_id, raison_sociale, statut)
          VALUES (${cabinetB.id}, 'Attaque cross-tenant SA', 'actif')
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier le client du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE crm.client SET statut = 'archive' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [c] = await sql`SELECT statut FROM crm.client WHERE id = ${clientB.id}`;
    expect(c?.statut).toBe("actif");
  });

  test("tenant A ne peut pas supprimer le client du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`DELETE FROM crm.client WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [c] = await sql`SELECT id FROM crm.client WHERE id = ${clientB.id}`;
    expect(c?.id).toBe(clientB.id);
  });

  // ─── doc.document ────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres documents (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM doc.document`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  test("tenant A ne peut pas lire le document du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM doc.document WHERE id = ${documentB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas modifier le document du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE doc.document SET libelle = 'hacked' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas supprimer le document du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`DELETE FROM doc.document WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [d] = await sql`SELECT id FROM doc.document WHERE id = ${documentB.id}`;
    expect(d?.id).toBe(documentB.id);
  });

  // ─── doc.proposition_classement / fichier_physique ───────────────────────────

  test("tenant A ne voit pas les propositions du cabinet B (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM doc.proposition_classement WHERE id = ${propositionB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne voit que ses propres fichiers physiques (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT cabinet_id FROM doc.fichier_physique`,
    );
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  // ─── extraction.invocation ───────────────────────────────────────────────────

  test("tenant A ne voit pas les invocations du cabinet B (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM extraction.invocation WHERE id = ${invocationB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas insérer une invocation pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO extraction.invocation
            (cabinet_id, context, invoked_by_module, input_type, model_used, prompt_version)
          VALUES (${cabinetB.id}, 'classification_doc', 'doc', 'document_id', 'stub', 'stub')
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── Trigger de cohérence cabinet/client (multi-tenant.md § 7) ────────────────

  test("le trigger rejette un document rattaché à un client d'un autre cabinet", async () => {
    // En service role (bypass RLS) : seul le trigger doit bloquer, pas la RLS.
    const fichier = await seedFichierPhysique(sql, cabinetA.id);
    await expect(
      sql`
        INSERT INTO doc.document
          (cabinet_id, client_id, fichier_physique_id, type, categorie, libelle, statut_classement)
        VALUES (
          ${cabinetA.id}, ${clientB.id}, ${fichier.id},
          'releve_bancaire', 'bancaire', 'Doc incohérent', 'manuel'
        )
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  // ─── Vérification schéma : RLS activée sur toutes les nouvelles tables ────────

  test("RLS est activée sur toutes les nouvelles tables métier", async () => {
    const tables = [
      "crm.client",
      "extraction.invocation",
      "doc.upload_brut",
      "doc.fichier_physique",
      "doc.proposition_classement",
      "doc.document",
    ];
    for (const t of tables) {
      const [row] = await sql`
        SELECT relrowsecurity FROM pg_class WHERE oid = ${t}::regclass
      `;
      expect(row?.relrowsecurity, `RLS doit être activée sur ${t}`).toBe(true);
    }
  });
});
