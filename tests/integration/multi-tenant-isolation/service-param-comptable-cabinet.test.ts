/**
 * Tests de cohérence cabinet/client et de contraintes — crm.service &
 * crm.param_comptable (Bloc A3, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (triggers trg_check_client_cabinet_{service,
 *     param_comptable}, migration 0011 → fn_check_client_cabinet) : un service /
 *     un paramétrage ne peut pas pointer vers un client d'un AUTRE cabinet.
 *  2. crm.service : au plus 1 service ACTIF de chaque type par client (index
 *     partiel uniq_service_actif_per_client_type — un service désactivé n'empêche
 *     pas d'en recréer un actif du même type).
 *  3. crm.param_comptable : 1-1 strict avec le client (client_id = PK).
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

describe("Cohérence cabinet/client & contraintes — crm.service / crm.param_comptable", () => {
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

  // ── crm.service ────────────────────────────────────────────────────────────

  test("service : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.service (cabinet_id, client_id, type)
      VALUES (${cabinetA.id}, ${clientA.id}, 'fiscalite')
      RETURNING id, client_id
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("service : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.service (cabinet_id, client_id, type)
        VALUES (${cabinetA.id}, ${clientB.id}, 'fiscalite')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("service : au plus 1 service actif de chaque type par client (index partiel)", async () => {
    await sql`
      INSERT INTO crm.service (cabinet_id, client_id, type, actif)
      VALUES (${cabinetA.id}, ${clientA.id}, 'tva', true)
    `;
    await expect(
      sql`
        INSERT INTO crm.service (cabinet_id, client_id, type, actif)
        VALUES (${cabinetA.id}, ${clientA.id}, 'tva', true)
      `,
    ).rejects.toThrow(/uniq_service_actif_per_client_type/);
  });

  test("service : un service désactivé du même type ne bloque pas un nouveau actif", async () => {
    await sql`
      INSERT INTO crm.service (cabinet_id, client_id, type, actif)
      VALUES (${cabinetB.id}, ${clientB.id}, 'salaires', false)
    `;
    const rows = await sql`
      INSERT INTO crm.service (cabinet_id, client_id, type, actif)
      VALUES (${cabinetB.id}, ${clientB.id}, 'salaires', true)
      RETURNING id
    `;
    expect(rows[0]?.id).toBeDefined();
  });

  // ── crm.param_comptable ──────────────────────────────────────────────────────

  test("param_comptable : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.param_comptable (client_id, cabinet_id, logiciel)
      VALUES (${clientA.id}, ${cabinetA.id}, 'bexio')
      RETURNING client_id, logiciel
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("param_comptable : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.param_comptable (client_id, cabinet_id, logiciel)
        VALUES (${clientB.id}, ${cabinetA.id}, 'cresus')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("param_comptable : 1-1 strict — un second paramétrage pour le même client est rejeté", async () => {
    // clientA a déjà sa ligne (test précédent) → re-insérer viole la PK client_id.
    await expect(
      sql`
        INSERT INTO crm.param_comptable (client_id, cabinet_id, logiciel)
        VALUES (${clientA.id}, ${cabinetA.id}, 'abacus')
      `,
    ).rejects.toThrow(/param_comptable_pkey/);
  });
});
