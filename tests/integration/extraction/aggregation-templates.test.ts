/**
 * H3b — moteur d'agrégation par templates paramétrés (sécurité + intégration DB).
 *
 * Tests ADVERSARIAUX (DoD KICKOFF H3) : template inconnu rejeté, injection SQL dans les
 * paramètres neutralisée par la validation Zod (uuid/int) AVANT toute requête, paramètre
 * inconnu rejeté. Plus : exécution réelle + cabinet_id imposé (isolation). Réf : search.md §6.2.
 */
import { AggregationError, runAggregation } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  const clientB = await seedClient(sql, cabinetB.id);
  // 2 documents cabinet A, 1 document cabinet B (ne doit jamais être compté pour A).
  const fpA1 = await seedFichierPhysique(sql, cabinet.id);
  const fpA2 = await seedFichierPhysique(sql, cabinet.id);
  await seedDocument(sql, cabinet.id, client.id, fpA1.id);
  await seedDocument(sql, cabinet.id, client.id, fpA2.id);
  const fpB = await seedFichierPhysique(sql, cabinetB.id);
  await seedDocument(sql, cabinetB.id, clientB.id, fpB.id);
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("runAggregation — sécurité (adversarial)", () => {
  test("template inconnu → AggregationError", async () => {
    await expect(
      runAggregation({ cabinet_id: cabinet.id, template_id: "DROP TABLE doc.document" }),
    ).rejects.toBeInstanceOf(AggregationError);
  });

  test("injection SQL dans client_id → rejetée par la validation (uuid) AVANT toute requête", async () => {
    await expect(
      runAggregation({
        cabinet_id: cabinet.id,
        template_id: "compter_documents_par_type",
        params: { client_id: "'; DROP TABLE doc.document; --" },
      }),
    ).rejects.toBeInstanceOf(AggregationError);
  });

  test("année non numérique → rejetée par la validation (int)", async () => {
    await expect(
      runAggregation({
        cabinet_id: cabinet.id,
        template_id: "compter_documents_par_type",
        params: { annee: "2026 OR 1=1" },
      }),
    ).rejects.toBeInstanceOf(AggregationError);
  });

  test("paramètre inconnu (ex. 'limit') → rejeté (schéma strict)", async () => {
    await expect(
      runAggregation({
        cabinet_id: cabinet.id,
        template_id: "compter_documents_par_type",
        params: { limit: 999, drop: true },
      }),
    ).rejects.toBeInstanceOf(AggregationError);
  });
});

describe("runAggregation — exécution + isolation", () => {
  test("compte les documents du cabinet (cabinet_id imposé) — jamais ceux d'un autre", async () => {
    const res = await runAggregation({
      cabinet_id: cabinet.id,
      template_id: "compter_documents_par_type",
    });
    expect(res.template_id).toBe("compter_documents_par_type");
    const total = res.rows.reduce((s, r) => s + Number(r.n ?? 0), 0);
    expect(total).toBe(2); // 2 docs cabinet A ; le doc de B n'est pas compté.
  });

  test("filtre client (uuid valide) accepté + scopé", async () => {
    const res = await runAggregation({
      cabinet_id: cabinet.id,
      template_id: "compter_documents_par_type",
      params: { client_id: client.id },
    });
    const total = res.rows.reduce((s, r) => s + Number(r.n ?? 0), 0);
    expect(total).toBe(2);
  });
});
