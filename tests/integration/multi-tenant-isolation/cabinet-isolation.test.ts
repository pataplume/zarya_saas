/**
 * Tests d'isolation multi-tenant — crm.cabinet_membre
 *
 * Ces tests sont BLOQUANTS en CI (cf. CLAUDE.md racine § "Tests obligatoires en CI").
 * Ils vérifient que les RLS policies empêchent tout accès cross-tenant.
 *
 * Stratégie :
 * - Service role pour créer les données de test (bypass RLS)
 * - `queryAsTenant()` pour simuler le contexte JWT d'un tenant authentifié
 * - Assertions sur le résultat : vide = RLS a bloqué, erreur = RLS a rejeté
 *
 * Références :
 * - /docs/architecture/multi-tenant.md § 5 — RLS policies
 * - packages/db/migrations/0002_onboarding_rls.sql — policies crm.cabinet_membre
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Multi-tenant isolation — crm.cabinet_membre", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres membres (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.cabinet_membre`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne voit aucun résultat en filtrant sur cabinet B (SELECT avec WHERE)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.cabinet_membre WHERE cabinet_id = ${cabinetB.id}`,
    );

    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas lire le membre spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.cabinet_membre WHERE id = ${cabinetB.membre_id}`,
    );

    expect(rows).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer un membre dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.cabinet_membre (id, cabinet_id, user_id, role)
          VALUES (gen_random_uuid(), ${cabinetB.id}, gen_random_uuid(), 'collaborateur')
        `,
      ),
    ).rejects.toThrow(); // RLS WITH CHECK doit lever une erreur
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les membres du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.cabinet_membre
        SET role = 'lecteur'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows affectées, pas d'erreur)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : le role du membre B n'a pas changé
    const [membre] = await sql`
      SELECT role FROM crm.cabinet_membre WHERE id = ${cabinetB.membre_id}
    `;
    expect(membre?.role).toBe("responsable"); // inchangé
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les membres du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.cabinet_membre
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    // RLS USING bloque silencieusement (0 rows supprimées)
    expect(rows).toHaveLength(0);

    // Vérification côté service role : le membre B existe toujours
    const [membre] = await sql`
      SELECT id FROM crm.cabinet_membre WHERE id = ${cabinetB.membre_id}
    `;
    expect(membre?.id).toBe(cabinetB.membre_id);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.cabinet_membre (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.cabinet_membre'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
