/**
 * IA-b — résolution cabinet-aware de EXTRACTION_MODE (ADR 0023).
 * `resolveExtractionModeForCabinet` = live SSI (env live = kill-switch global maître) ET
 * (crm.cabinet.extraction_ia_active = true). Vérifie la table de vérité complète.
 */
import { resolveExtractionModeForCabinet } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("resolveExtractionModeForCabinet (IA-b, ADR 0023)", () => {
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

  async function setFlag(active: boolean) {
    await sql`UPDATE crm.cabinet SET extraction_ia_active = ${active} WHERE id = ${cab.id}`;
  }

  test("env stub → stub même si le flag cabinet est ON (kill-switch global maître)", async () => {
    await setFlag(true);
    expect(await resolveExtractionModeForCabinet(cab.id, "stub")).toBe("stub");
    expect(await resolveExtractionModeForCabinet(cab.id, undefined)).toBe("stub");
  });

  test("env live + flag cabinet OFF → stub", async () => {
    await setFlag(false);
    expect(await resolveExtractionModeForCabinet(cab.id, "live")).toBe("stub");
  });

  test("env live + flag cabinet ON → live", async () => {
    await setFlag(true);
    expect(await resolveExtractionModeForCabinet(cab.id, "live")).toBe("live");
  });

  test("env live + cabinet inconnu → stub (pas de ligne, défaut sûr)", async () => {
    expect(
      await resolveExtractionModeForCabinet("00000000-0000-0000-0000-000000000000", "live"),
    ).toBe("stub");
  });
});
