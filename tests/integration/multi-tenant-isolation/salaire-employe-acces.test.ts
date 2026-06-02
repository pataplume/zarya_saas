/**
 * Tests d'isolation multi-tenant — salaire.employe + salaire.acces_client (Bloc F0, migration 0031).
 *
 * BLOQUANTS en CI. Vérifient les RLS policies (chemin DB) + le trigger de cohérence
 * fn_check_client_cabinet (couple cabinet_id/client_id). Le chemin applicatif (db service
 * role, RLS contournée) est couvert par cross-tenant-leak/generic-leak.test.ts.
 *
 * Références : /docs/architecture/multi-tenant.md § 5 ; packages/db/migrations/0031… ; ADR 0013.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedAccesClient,
  seedClient,
  seedContact,
  seedEmploye,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Multi-tenant isolation — salaire.* (F0)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let employeA: { id: string };
  let employeB: { id: string };

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    employeA = await seedEmploye(sql, cabinetA.id, clientA.id);
    employeB = await seedEmploye(sql, cabinetB.id, clientB.id);
    await seedAccesClient(sql, cabinetA.id, clientA.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("tenant A ne voit que ses propres employés (RLS SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM salaire.employe`,
    );
    expect(rows.some((r) => r.id === employeA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === employeB.id)).toBe(false);
  });

  test("tenant A ne peut pas insérer un employé dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO salaire.employe (id, cabinet_id, client_id, prenom, nom)
          VALUES (gen_random_uuid(), ${cabinetB.id}, ${clientB.id}, 'Intrus', 'X')
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier l'employé du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE salaire.employe SET nom = 'Hack' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("le trigger refuse un employé dont le client appartient à un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO salaire.employe (id, cabinet_id, client_id, prenom, nom)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, 'Incohérent', 'Y')
      `,
    ).rejects.toThrow();
  });

  test("le trigger refuse un acces_client dont le client appartient à un autre cabinet", async () => {
    const contactA = await seedContact(sql, cabinetA.id, clientA.id);
    await expect(
      sql`
        INSERT INTO salaire.acces_client (id, cabinet_id, client_id, contact_id, email)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, ${contactA.id}, 'x@test.ch')
      `,
    ).rejects.toThrow();
  });

  test.each([
    ["salaire", "employe"],
    ["salaire", "acces_client"],
  ])("RLS est activée sur %s.%s", async (schema, table) => {
    const [row] = await sql`
      SELECT relrowsecurity FROM pg_class WHERE oid = ${`${schema}.${table}`}::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
