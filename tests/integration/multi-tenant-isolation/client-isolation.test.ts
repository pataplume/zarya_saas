/**
 * Tests d'isolation multi-tenant — crm.client
 *
 * Ces tests sont BLOQUANTS en CI (cf. CLAUDE.md racine § "Tests obligatoires en CI").
 * Ils vérifient que les RLS policies empêchent tout accès cross-tenant sur le
 * chemin DB (RLS Postgres). Le chemin applicatif (db service role) est couvert
 * par tests/integration/cross-tenant-leak/generic-leak.test.ts.
 *
 * Stratégie :
 * - Service role pour créer les données de test (bypass RLS)
 * - `queryAsTenant()` pour simuler le contexte JWT d'un tenant authentifié
 * - Assertions sur le résultat : vide = RLS a bloqué, erreur = RLS a rejeté
 *
 * Références :
 * - /docs/architecture/multi-tenant.md § 5 — RLS policies
 * - packages/db/migrations/0004_doc_module.sql — policies crm.client
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Multi-tenant isolation — crm.client", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres clients (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.client`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.id === clientA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne voit aucun résultat en filtrant sur cabinet B (SELECT avec WHERE)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.client WHERE cabinet_id = ${cabinetB.id}`,
    );

    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas lire le client spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.client WHERE id = ${clientB.id}`,
    );

    expect(rows).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer un client dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.client (id, cabinet_id, raison_sociale, statut)
          VALUES (gen_random_uuid(), ${cabinetB.id}, 'Cross-tenant SA', 'actif')
        `,
      ),
    ).rejects.toThrow(); // RLS WITH CHECK doit lever une erreur
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les clients du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.client
        SET raison_sociale = 'Piraté SA'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows affectées, pas d'erreur)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : la raison sociale du client B n'a pas changé
    const [c] = await sql`
      SELECT raison_sociale FROM crm.client WHERE id = ${clientB.id}
    `;
    expect(c?.raison_sociale).not.toBe("Piraté SA");
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les clients du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.client
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows supprimées)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : le client B existe toujours
    const [c] = await sql`
      SELECT id FROM crm.client WHERE id = ${clientB.id}
    `;
    expect(c?.id).toBe(clientB.id);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.client (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.client'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
