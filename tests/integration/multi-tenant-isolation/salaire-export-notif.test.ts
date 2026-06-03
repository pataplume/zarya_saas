/**
 * Tests d'isolation multi-tenant — export/notif salaire (Bloc G1b, migration 0037).
 *
 * BLOQUANTS en CI. RLS + trigger fn_check_client_cabinet sur export/notification/relance/piece.
 * format_export/mapping_export = catalogues (global lisible + override). Réf : salaire-schema.md ;
 * multi-tenant.md §5 ; migration 0037.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedNotificationSalaire,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Multi-tenant isolation — export/notif salaire (G1b)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let periodeA: { id: string };
  let periodeB: { id: string };
  let notifA: { id: string };
  let notifB: { id: string };

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    periodeA = await seedPeriode(sql, cabinetA.id, clientA.id);
    periodeB = await seedPeriode(sql, cabinetB.id, clientB.id);
    notifA = await seedNotificationSalaire(sql, cabinetA.id, clientA.id, periodeA.id);
    notifB = await seedNotificationSalaire(sql, cabinetB.id, clientB.id, periodeB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("tenant A ne voit que ses propres notifications (RLS SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM salaire.notification`,
    );
    expect(rows.some((r) => r.id === notifA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === notifB.id)).toBe(false);
  });

  test("tenant A ne peut pas insérer une notification dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO salaire.notification (id, cabinet_id, client_id, periode_id, type)
          VALUES (gen_random_uuid(), ${cabinetB.id}, ${clientB.id}, ${periodeB.id}, 'initiale')
        `,
      ),
    ).rejects.toThrow();
  });

  test("le trigger refuse une relance dont le client appartient à un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO salaire.relance (id, cabinet_id, client_id, periode_id, numero)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, ${periodeA.id}, 1)
      `,
    ).rejects.toThrow();
  });

  test.each([
    ["salaire", "format_export"],
    ["salaire", "mapping_export"],
    ["salaire", "export"],
    ["salaire", "notification"],
    ["salaire", "relance"],
    ["salaire", "piece"],
  ])("RLS est activée sur %s.%s", async (schema, table) => {
    const [row] = await sql`
      SELECT relrowsecurity FROM pg_class WHERE oid = ${`${schema}.${table}`}::regclass`;
    expect(row?.relrowsecurity).toBe(true);
  });
});
