/**
 * Tests d'isolation multi-tenant — module Calendar, Run 1 (échéances & relances)
 *
 * Couvre les nouvelles tables métier : crm.echeance, crm.relance.
 *
 * Policies standard : 4 opérations filtrent sur current_cabinet_id() (style 0004).
 * Vérifie aussi le trigger de cohérence cabinet/client (multi-tenant.md § 7) :
 * impossible de rattacher une échéance/relance à un client d'un autre cabinet.
 *
 * Références :
 * - packages/db/migrations/0005_calendar_echeance_relance.sql
 * - docs/architecture/decisions/0011-calendar-mvp-scope.md
 * - docs/architecture/multi-tenant.md § 5 et § 7
 * - tests/CLAUDE.md § "Multi-tenant isolation (bloquants)"
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEcheance,
  seedRelance,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
  type TestEcheance,
  type TestRelance,
} from "../helpers/seed";

describe("Multi-tenant isolation — module Calendar (échéances & relances)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let echeanceA: TestEcheance;
  let echeanceB: TestEcheance;
  let _relanceA: TestRelance;
  let relanceB: TestRelance;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;

    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);

    echeanceA = await seedEcheance(sql, cabinetA.id, clientA.id);
    echeanceB = await seedEcheance(sql, cabinetB.id, clientB.id);

    _relanceA = await seedRelance(sql, cabinetA.id, clientA.id, echeanceA.id);
    relanceB = await seedRelance(sql, cabinetB.id, clientB.id, echeanceB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── crm.echeance ────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres échéances (SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.echeance`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  test("tenant A ne peut pas lire l'échéance du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.echeance WHERE id = ${echeanceB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas insérer une échéance pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.echeance (cabinet_id, client_id, type, libelle, date_echeance)
          VALUES (${cabinetB.id}, ${clientB.id}, 'tva', 'Attaque cross-tenant', now())
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier l'échéance du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE crm.echeance SET libelle = 'hacked' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [e] = await sql`SELECT libelle FROM crm.echeance WHERE id = ${echeanceB.id}`;
    expect(e?.libelle).not.toBe("hacked");
  });

  test("tenant A ne peut pas supprimer l'échéance du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`DELETE FROM crm.echeance WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [e] = await sql`SELECT id FROM crm.echeance WHERE id = ${echeanceB.id}`;
    expect(e?.id).toBe(echeanceB.id);
  });

  // ─── crm.relance ─────────────────────────────────────────────────────────────

  test("tenant A ne peut pas lire la relance du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.relance WHERE id = ${relanceB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas modifier la relance du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE crm.relance SET sujet = 'hacked' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas supprimer la relance du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`DELETE FROM crm.relance WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [r] = await sql`SELECT id FROM crm.relance WHERE id = ${relanceB.id}`;
    expect(r?.id).toBe(relanceB.id);
  });

  // ─── Trigger de cohérence cabinet/client (multi-tenant.md § 7) ────────────────

  test("le trigger rejette une échéance rattachée à un client d'un autre cabinet", async () => {
    // En service role (bypass RLS) : seul le trigger doit bloquer.
    await expect(
      sql`
        INSERT INTO crm.echeance (cabinet_id, client_id, type, libelle, date_echeance)
        VALUES (${cabinetA.id}, ${clientB.id}, 'tva', 'Échéance incohérente', now())
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("le trigger rejette une relance rattachée à un client d'un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO crm.relance (cabinet_id, client_id, canal, statut)
        VALUES (${cabinetA.id}, ${clientB.id}, 'email', 'brouillon')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  // ─── Vérification schéma : RLS activée sur les nouvelles tables ───────────────

  test("RLS est activée sur crm.echeance et crm.relance", async () => {
    for (const t of ["crm.echeance", "crm.relance"]) {
      const [row] = await sql`
        SELECT relrowsecurity FROM pg_class WHERE oid = ${t}::regclass
      `;
      expect(row?.relrowsecurity, `RLS doit être activée sur ${t}`).toBe(true);
    }
  });
});
