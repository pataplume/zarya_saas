/**
 * Tests d'intégration — persistance du verdict de région + accusé de réception (D3).
 *
 * Vérifie contre la base partagée que saveTenantRegionVerdict et acknowledgeTenantRegion
 * écrivent bien dans crm.cabinet_integration.parametres (données NON sensibles), et
 * lèvent `not_connected` si le cabinet n'a pas d'intégration active.
 *
 * Réf : packages/integrations/src/microsoft/token-store.ts (D3),
 * docs/architecture/microsoft-integration.md §3.3.
 */
import { acknowledgeTenantRegion, saveTenantRegionVerdict } from "@zarya/integrations";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedCabinetIntegration,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

describe("Persistance région tenant + accusé (D3)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet; // avec intégration
  let cabinetB: TestCabinet; // SANS intégration

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    await seedCabinetIntegration(sql, cabinetA.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("saveTenantRegionVerdict écrit le verdict dans parametres", async () => {
    await saveTenantRegionVerdict(cabinetA.id, {
      countryCode: "US",
      dataLocation: null,
      source: "countryLetterCode",
      isAdequate: false,
      checkedAt: "2026-06-01T10:00:00.000Z",
    });
    const [row] = await sql<{ parametres: Record<string, unknown> }[]>`
      SELECT parametres FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND provider = 'microsoft_graph' AND archived_at IS NULL
    `;
    expect(row?.parametres).toMatchObject({
      region_country_code: "US",
      region_source: "countryLetterCode",
      region_adequate: false,
      region_checked_at: "2026-06-01T10:00:00.000Z",
      tenant_region: "US",
    });
  });

  test("acknowledgeTenantRegion enregistre l'accusé (acteur + horodatage)", async () => {
    await acknowledgeTenantRegion(
      cabinetA.id,
      { id: "user-123", type: "cabinet_membre" },
      1_700_000_000_000,
    );
    const [row] = await sql<{ parametres: Record<string, unknown> }[]>`
      SELECT parametres FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND provider = 'microsoft_graph' AND archived_at IS NULL
    `;
    expect(row?.parametres).toMatchObject({
      region_acknowledged_by: "user-123",
      region_acknowledged_acteur_type: "cabinet_membre",
      region_acknowledged_at: new Date(1_700_000_000_000).toISOString(),
      // le verdict précédent n'est pas écrasé (fusion)
      region_country_code: "US",
    });
  });

  test("saveTenantRegionVerdict lève not_connected si pas d'intégration", async () => {
    await expect(
      saveTenantRegionVerdict(cabinetB.id, {
        countryCode: "CH",
        dataLocation: null,
        source: "countryLetterCode",
        isAdequate: true,
        checkedAt: "2026-06-01T10:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "not_connected" });
  });
});
