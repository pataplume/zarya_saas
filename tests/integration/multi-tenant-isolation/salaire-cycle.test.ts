/**
 * Tests d'isolation multi-tenant — cycle mensuel salaire (Bloc G1a, migration 0036).
 *
 * BLOQUANTS en CI. RLS policies (chemin DB) + trigger fn_check_client_cabinet sur periode/
 * element_paie/absence/changement/validation/evenement. type_element_paie = catalogue
 * (global lisible + override cabinet). Réf : salaire-schema.md ; multi-tenant.md §5 ; migration 0036.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEmploye,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Multi-tenant isolation — cycle salaire (G1a)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let periodeA: { id: string };
  let periodeB: { id: string };

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    await seedEmploye(sql, cabinetA.id, clientA.id);
    periodeA = await seedPeriode(sql, cabinetA.id, clientA.id);
    periodeB = await seedPeriode(sql, cabinetB.id, clientB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("tenant A ne voit que ses propres périodes (RLS SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM salaire.periode`,
    );
    expect(rows.some((r) => r.id === periodeA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === periodeB.id)).toBe(false);
  });

  test("tenant A ne peut pas insérer une période dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation)
          VALUES (gen_random_uuid(), ${cabinetB.id}, ${clientB.id}, 2026, 6, '2026-06-25')
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier la période du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE salaire.periode SET notes_client = 'hack' WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("le trigger refuse une période dont le client appartient à un autre cabinet", async () => {
    await expect(
      sql`
        INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientB.id}, 2026, 7, '2026-07-25')
      `,
    ).rejects.toThrow();
  });

  test("catalogue type_element_paie : types globaux (cabinet_id NULL) lisibles par tout tenant", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`SELECT code FROM salaire.type_element_paie WHERE cabinet_id IS NULL AND code = 'HEURES_NORMALES'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test.each([
    ["salaire", "periode"],
    ["salaire", "element_paie"],
    ["salaire", "absence"],
    ["salaire", "changement"],
    ["salaire", "validation"],
    ["salaire", "evenement"],
    ["salaire", "type_element_paie"],
  ])("RLS est activée sur %s.%s", async (schema, table) => {
    const [row] = await sql`
      SELECT relrowsecurity FROM pg_class WHERE oid = ${`${schema}.${table}`}::regclass`;
    expect(row?.relrowsecurity).toBe(true);
  });
});
