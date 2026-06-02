/**
 * Tests d'isolation multi-tenant — facture.* (Bloc E1, migration 0030).
 *
 * BLOQUANTS en CI. Vérifient que les RLS policies empêchent tout accès cross-tenant
 * sur le chemin DB (RLS Postgres) ET que le trigger de cohérence fn_check_client_cabinet
 * refuse un couple (cabinet_id, client_id) incohérent. Le chemin applicatif (db service
 * role, RLS contournée) est couvert par tests/integration/cross-tenant-leak/generic-leak.
 *
 * Tables couvertes : facture.fournisseur, facture.proposition_facture, facture.facture,
 * facture.mapping_export. fournisseur sert de représentant pour les sous-tests CRUD
 * (mêmes 4 policies génériques sur les 4 tables), facture.facture pour UPDATE/DELETE.
 *
 * Références :
 * - /docs/architecture/multi-tenant.md § 5 — RLS policies
 * - packages/db/migrations/0030_facture_schema.sql — policies + triggers cohérence
 * - ADR 0020 — décodage QR-facture (contexte Bloc E)
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFacture,
  seedFournisseur,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
  type TestFactureRow,
  type TestFournisseur,
} from "../helpers/seed";

describe("Multi-tenant isolation — facture.* (E1)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let fournA: TestFournisseur;
  let fournB: TestFournisseur;
  let factA: TestFactureRow;
  let factB: TestFactureRow;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    fournA = await seedFournisseur(sql, cabinetA.id, clientA.id);
    fournB = await seedFournisseur(sql, cabinetB.id, clientB.id);
    factA = await seedFacture(sql, cabinetA.id, clientA.id, fournA.id);
    factB = await seedFacture(sql, cabinetB.id, clientB.id, fournB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres fournisseurs", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM facture.fournisseur`,
    );
    expect(rows.some((r) => r.id === fournA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === fournB.id)).toBe(false);
  });

  test("tenant A voit sa propre facture mais pas celle du cabinet B (SELECT par id)", async () => {
    const sienne = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM facture.facture WHERE id = ${factA.id}`,
    );
    expect(sienne.some((r) => r.id === factA.id)).toBe(true);

    const autre = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM facture.facture WHERE id = ${factB.id}`,
    );
    expect(autre).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer un fournisseur dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO facture.fournisseur (id, cabinet_id, client_id, raison_sociale)
          VALUES (gen_random_uuid(), ${cabinetB.id}, ${clientB.id}, 'Intrus SA')
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les factures du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE facture.facture
        SET statut = 'annulee'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );
    expect(rows).toHaveLength(0);

    const [row] = await sql`SELECT statut FROM facture.facture WHERE id = ${factB.id}`;
    expect(row?.statut).toBe("en_attente_validation");
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les fournisseurs du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM facture.fournisseur
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );
    expect(rows).toHaveLength(0);

    const [row] = await sql`SELECT id FROM facture.fournisseur WHERE id = ${fournB.id}`;
    expect(row?.id).toBe(fournB.id);
  });

  // ─── Trigger de cohérence (cabinet_id ↔ client_id) ──────────────────────────

  test("le trigger refuse un fournisseur dont le client appartient à un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO facture.fournisseur (id, cabinet_id, client_id, raison_sociale)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, 'Incohérent SA')
      `,
    ).rejects.toThrow();
  });

  test("le trigger refuse une facture dont le client appartient à un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO facture.facture
          (id, cabinet_id, client_id, fournisseur_id, document_id, numero_facture,
           date_emission, total_ht, total_tva, total_ttc, montant_a_payer, compte_charge, statut_classement)
        SELECT gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, ${fournA.id}, d.id,
               'F-INCOH', CURRENT_DATE, 100, 8.10, 108.10, 108.10, '6000', 'manuel'
        FROM doc.document d WHERE d.cabinet_id = ${cabinetA.id} LIMIT 1
      `,
    ).rejects.toThrow();
  });

  // ─── Vérification schéma — RLS activée sur les 4 tables ─────────────────────

  test.each([
    ["facture", "fournisseur"],
    ["facture", "proposition_facture"],
    ["facture", "facture"],
    ["facture", "mapping_export"],
  ])("RLS est activée sur %s.%s", async (schema, table) => {
    const [row] = await sql`
      SELECT relrowsecurity FROM pg_class WHERE oid = ${`${schema}.${table}`}::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
