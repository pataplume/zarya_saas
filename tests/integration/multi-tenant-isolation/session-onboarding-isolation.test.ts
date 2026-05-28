/**
 * Tests d'isolation multi-tenant — crm.session_onboarding_fiduciaire
 *
 * La session est créée automatiquement par le trigger crm.provision_nouveau_cabinet
 * lors de l'INSERT d'un cabinet. Il y a donc exactement 1 session par cabinet.
 *
 * Particularité de la policy SELECT :
 *   cabinet_id = current_cabinet_id()
 *   OR cabinet_id IN (SELECT id FROM crm.cabinet WHERE created_by = auth.uid())
 * Le second OR ne s'applique pas ici (auth.uid() = NULL en contexte test),
 * donc seule la première condition compte.
 *
 * Références :
 * - packages/db/migrations/0002_onboarding_rls.sql — policies session_onboarding_fiduciaire
 * - docs/architecture/multi-tenant.md § 5
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import { cleanupCabinets, getSessionId, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Multi-tenant isolation — crm.session_onboarding_fiduciaire", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let _sessionAId: string;
  let sessionBId: string;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    // Sessions créées automatiquement par le trigger à l'INSERT des cabinets
    _sessionAId = await getSessionId(sql, cabinetA.id);
    sessionBId = await getSessionId(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que sa propre session (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.session_onboarding_fiduciaire`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne voit aucun résultat en filtrant sur cabinet B (SELECT WHERE)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`SELECT id FROM crm.session_onboarding_fiduciaire WHERE cabinet_id = ${cabinetB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas lire la session spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.session_onboarding_fiduciaire WHERE id = ${sessionBId}`,
    );
    expect(rows).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer une session pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.session_onboarding_fiduciaire (cabinet_id, statut)
          VALUES (${cabinetB.id}, 'inscrit')
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier la session du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.session_onboarding_fiduciaire
        SET statut = 'abandonne'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : statut de B inchangé
    const [session] = await sql`
      SELECT statut FROM crm.session_onboarding_fiduciaire WHERE id = ${sessionBId}
    `;
    expect(session?.statut).toBe("inscrit");
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer la session du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.session_onboarding_fiduciaire
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : session B existe toujours
    const [session] = await sql`
      SELECT id FROM crm.session_onboarding_fiduciaire WHERE id = ${sessionBId}
    `;
    expect(session?.id).toBe(sessionBId);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.session_onboarding_fiduciaire (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.session_onboarding_fiduciaire'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
