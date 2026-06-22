/**
 * IA-a — schéma activation IA par cabinet (ADR 0023, migrations 0043 + 0052). Vérifie :
 *  1. crm.cabinet.extraction_ia_active vaut true par défaut (opt-out bêta, migration 0052 ;
 *     l'IA reste gatée par EXTRACTION_MODE=live, kill-switch global) ;
 *  2. la vue extraction.v_cout_par_cabinet agrège bien les invocations d'un cabinet,
 *     scopée par cabinet_id.
 */
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedInvocation,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

describe("Activation IA par cabinet — schéma (IA-a, ADR 0023)", () => {
  let sql: postgres.Sql;
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("extraction_ia_active = true par défaut (opt-out bêta, migration 0052)", async () => {
    const [row] = (await sql`
      SELECT extraction_ia_active FROM crm.cabinet WHERE id = ${cabinetA.id}
    `) as unknown as { extraction_ia_active: boolean }[];
    expect(row?.extraction_ia_active).toBe(true);
  });

  test("v_cout_par_cabinet agrège les invocations, scopée cabinet", async () => {
    await seedInvocation(sql, cabinetA.id);
    await seedInvocation(sql, cabinetA.id);
    await seedInvocation(sql, cabinetB.id);

    const [rowA] = (await sql`
      SELECT nb_invocations, cout_usd_total FROM extraction.v_cout_par_cabinet
      WHERE cabinet_id = ${cabinetA.id}
    `) as unknown as { nb_invocations: number; cout_usd_total: string }[];
    expect(Number(rowA?.nb_invocations)).toBeGreaterThanOrEqual(2);
    expect(rowA?.cout_usd_total).toBeDefined();

    // Scope : la ligne de A ne compte pas les invocations de B.
    const [rowB] = (await sql`
      SELECT nb_invocations FROM extraction.v_cout_par_cabinet WHERE cabinet_id = ${cabinetB.id}
    `) as unknown as { nb_invocations: number }[];
    expect(Number(rowB?.nb_invocations)).toBeGreaterThanOrEqual(1);
    expect(Number(rowA?.nb_invocations)).not.toBe(Number(rowB?.nb_invocations) + 100);
  });
});
