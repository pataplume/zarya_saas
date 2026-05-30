/**
 * Tests d'isolation multi-tenant — crm.cabinet_integration (Bloc D1, migration 0024).
 *
 * BLOQUANTS en CI. Vérifient que les RLS policies empêchent tout accès cross-tenant
 * sur le chemin DB (RLS Postgres). Le chemin applicatif (db service role) est couvert
 * par tests/integration/cross-tenant-leak/generic-leak.test.ts.
 *
 * Particularité D1 : la table n'a PAS de client_id (intégration au niveau cabinet),
 * donc pas de trigger fn_check_client_cabinet — l'isolation repose uniquement sur les
 * 4 policies RLS scopées par current_cabinet_id().
 *
 * Références :
 * - /docs/architecture/multi-tenant.md § 5 — RLS policies
 * - packages/db/migrations/0024_crm_cabinet_integration.sql — policies
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedCabinetIntegration,
  seedTwoCabinets,
  type TestCabinet,
  type TestCabinetIntegration,
} from "../helpers/seed";

describe("Multi-tenant isolation — crm.cabinet_integration (D1)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let integA: TestCabinetIntegration;
  let integB: TestCabinetIntegration;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    integA = await seedCabinetIntegration(sql, cabinetA.id);
    integB = await seedCabinetIntegration(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres intégrations (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.cabinet_integration`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === integA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne peut pas lire l'intégration spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.cabinet_integration WHERE id = ${integB.id}`,
    );

    expect(rows).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer une intégration dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.cabinet_integration (id, cabinet_id, provider, statut)
          VALUES (gen_random_uuid(), ${cabinetB.id}, 'microsoft_graph', 'en_attente')
        `,
      ),
    ).rejects.toThrow(); // RLS WITH CHECK doit lever une erreur
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les intégrations du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.cabinet_integration
        SET statut = 'revoque'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows affectées, pas d'erreur)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : le statut du cabinet B n'a pas changé
    const [row] = await sql`
      SELECT statut FROM crm.cabinet_integration WHERE id = ${integB.id}
    `;
    expect(row?.statut).toBe("en_attente");
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les intégrations du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.cabinet_integration
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows supprimées)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : l'intégration B existe toujours
    const [row] = await sql`
      SELECT id FROM crm.cabinet_integration WHERE id = ${integB.id}
    `;
    expect(row?.id).toBe(integB.id);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.cabinet_integration (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.cabinet_integration'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
