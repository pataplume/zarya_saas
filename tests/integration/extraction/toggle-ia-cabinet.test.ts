/**
 * IA-c — bascule du flag d'activation IA cabinet + lecture des coûts (ADR 0023).
 * Vérifie au niveau DB (chemin app) : on peut activer/désactiver crm.cabinet.extraction_ia_active
 * de façon scopée, et la vue v_cout_par_cabinet reflète les invocations du cabinet.
 * (La server action elle-même = wrapper auth + cet UPDATE ; testée via la même mécanique DB.)
 */
import { cabinet, db, eq } from "@zarya/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedInvocation,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

describe("Toggle IA cabinet + coûts (IA-c, ADR 0023)", () => {
  let sql: postgres.Sql;
  let cab: TestCabinet;
  let cabB: TestCabinet;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cab = r.cabinetA;
    cabB = r.cabinetB;
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cab.id, cabB.id);
    await sql.end();
  });

  test("activation/désactivation scopée du flag extraction_ia_active", async () => {
    // Défaut false (IA-a).
    const [before] = await db
      .select({ active: cabinet.extraction_ia_active })
      .from(cabinet)
      .where(eq(cabinet.id, cab.id));
    expect(before?.active).toBe(false);

    // Active A.
    await db.update(cabinet).set({ extraction_ia_active: true }).where(eq(cabinet.id, cab.id));
    const [after] = await db
      .select({ active: cabinet.extraction_ia_active })
      .from(cabinet)
      .where(eq(cabinet.id, cab.id));
    expect(after?.active).toBe(true);

    // B n'a pas bougé (scope).
    const [bFlag] = await db
      .select({ active: cabinet.extraction_ia_active })
      .from(cabinet)
      .where(eq(cabinet.id, cabB.id));
    expect(bFlag?.active).toBe(false);

    // Désactive A.
    await db.update(cabinet).set({ extraction_ia_active: false }).where(eq(cabinet.id, cab.id));
    const [reset] = await db
      .select({ active: cabinet.extraction_ia_active })
      .from(cabinet)
      .where(eq(cabinet.id, cab.id));
    expect(reset?.active).toBe(false);
  });

  test("la vue de coûts reflète les invocations du cabinet", async () => {
    await seedInvocation(sql, cab.id);
    const [row] = (await sql`
      SELECT nb_invocations, cout_usd_total FROM extraction.v_cout_par_cabinet
      WHERE cabinet_id = ${cab.id}
    `) as unknown as { nb_invocations: number; cout_usd_total: string }[];
    expect(Number(row?.nb_invocations)).toBeGreaterThanOrEqual(1);
  });
});
