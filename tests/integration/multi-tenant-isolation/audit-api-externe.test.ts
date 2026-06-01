/**
 * Tests d'isolation + append-only — audit.api_externe (Bloc D2, migration 0025).
 *
 * BLOQUANTS en CI. Cette table d'audit n'est PAS dans METIER_TABLES (son trigger
 * append-only ferait lever les sous-tests UPDATE/DELETE no-op du test générique) —
 * elle est donc couverte ici de façon dédiée :
 *   1. isolation RLS (SELECT/INSERT scopés current_cabinet_id()) ;
 *   2. append-only : UPDATE et DELETE lèvent, MÊME en service role (trigger).
 *
 * Références :
 * - docs/architecture/security-and-audit.md §8.4 (append-only) + §8.5 (consultation)
 * - packages/db/migrations/0025_audit_api_externe.sql
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Isolation + append-only — audit.api_externe (D2)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let rowAId: string;
  let rowBId: string;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;

    const [a] = await sql<{ id: string }[]>`
      INSERT INTO audit.api_externe (cabinet_id, provider, endpoint, method, ok, latency_ms)
      VALUES (${cabinetA.id}, 'microsoft_graph', '/me/messages', 'GET', true, 42)
      RETURNING id
    `;
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO audit.api_externe (cabinet_id, provider, endpoint, method, ok, latency_ms)
      VALUES (${cabinetB.id}, 'microsoft_graph', '/me/sendMail', 'POST', false, 17)
      RETURNING id
    `;
    rowAId = a?.id ?? "";
    rowBId = b?.id ?? "";
  });

  afterAll(async () => {
    // Les lignes d'audit étant append-only, on ne peut pas les DELETE : on supprime
    // d'abord via session_replication_role = replica (désactive les triggers) avant
    // de retirer les cabinets (FK ON DELETE RESTRICT).
    await sql`SET session_replication_role = replica`;
    await sql`DELETE FROM audit.api_externe WHERE cabinet_id IN (${cabinetA.id}, ${cabinetB.id})`;
    await sql`SET session_replication_role = DEFAULT`;
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── Isolation (RLS) ─────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres lignes d'audit", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM audit.api_externe`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === rowAId)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne peut pas lire la ligne d'audit du cabinet B", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM audit.api_externe WHERE id = ${rowBId}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas insérer une ligne d'audit pour le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) => tsql`
          INSERT INTO audit.api_externe (cabinet_id, provider, endpoint, method, ok, latency_ms)
          VALUES (${cabinetB.id}, 'microsoft_graph', '/me/messages', 'GET', true, 1)
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── Append-only (trigger — bloque même le service role) ───────────────────────

  test("UPDATE est interdit (append-only), même en service role", async () => {
    await expect(sql`UPDATE audit.api_externe SET ok = false WHERE id = ${rowAId}`).rejects.toThrow(
      /append-only/i,
    );
  });

  test("DELETE est interdit (append-only), même en service role", async () => {
    await expect(sql`DELETE FROM audit.api_externe WHERE id = ${rowAId}`).rejects.toThrow(
      /append-only/i,
    );
  });

  // ─── Schéma ────────────────────────────────────────────────────────────────────

  test("RLS est activée sur audit.api_externe", async () => {
    const [row] = await sql<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE oid = 'audit.api_externe'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
