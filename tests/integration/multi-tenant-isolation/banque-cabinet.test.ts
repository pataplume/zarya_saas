/**
 * Tests de cohérence cabinet/client et de contraintes — crm.banque
 * (Bloc A6, migration 0014, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (trigger trg_check_client_cabinet_banque →
 *     fn_check_client_cabinet) : un compte bancaire ne peut pas pointer vers un
 *     client d'un AUTRE cabinet.
 *  2. iban est NOT NULL : un INSERT sans iban est rejeté.
 *  3. Un client peut avoir plusieurs comptes (pas de contrainte d'unicité) :
 *     deux comptes pour le même client sont acceptés.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Cohérence cabinet/client & contraintes — crm.banque (A6)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("banque : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.banque (cabinet_id, client_id, iban, usage)
      VALUES (${cabinetA.id}, ${clientA.id}, ${"CH00-TEST-A"}, 'principal')
      RETURNING id, client_id, devise, actif
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
    // DEFAULT 'CHF' et actif true appliqués par la DB.
    expect(rows[0]?.devise).toBe("CHF");
    expect(rows[0]?.actif).toBe(true);
  });

  test("banque : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.banque (cabinet_id, client_id, iban)
        VALUES (${cabinetA.id}, ${clientB.id}, ${"CH00-TEST-LEAK"})
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("banque : INSERT sans iban est rejeté (NOT NULL)", async () => {
    await expect(
      sql`
        INSERT INTO crm.banque (cabinet_id, client_id, usage)
        VALUES (${cabinetA.id}, ${clientA.id}, 'secondaire')
      `,
    ).rejects.toThrow(/iban/);
  });

  test("banque : un client peut avoir plusieurs comptes (pas d'unicité)", async () => {
    const rows = await sql`
      INSERT INTO crm.banque (cabinet_id, client_id, iban, usage)
      VALUES (${cabinetA.id}, ${clientA.id}, ${"CH00-TEST-A2"}, 'paie')
      RETURNING id
    `;
    expect(rows[0]?.id).toBeDefined();
    const [count] = await sql`
      SELECT count(*)::int AS n FROM crm.banque WHERE client_id = ${clientA.id}
    `;
    expect(count?.n).toBeGreaterThanOrEqual(2);
  });
});
