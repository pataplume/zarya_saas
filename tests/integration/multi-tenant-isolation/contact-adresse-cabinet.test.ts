/**
 * Tests de cohérence cabinet/client et d'unicité — crm.contact & crm.adresse
 * (Bloc A2, ADR 0012).
 *
 * BLOQUANT en CI. Deux garanties DB de dernier rempart, testées via le service
 * role (qui bypasse la RLS — c'est précisément le chemin où une erreur applicative
 * pourrait écrire une ligne incohérente) :
 *
 *  1. Cohérence cabinet/client (trigger trg_check_client_cabinet_{contact,adresse},
 *     migration 0010 → fn_check_client_cabinet) : un contact / une adresse ne peut
 *     pas pointer vers un client d'un AUTRE cabinet (fuite tenant).
 *  2. Unicité du « principal » (index partiels uniq_contact_principal_per_client /
 *     uniq_adresse_principale_per_client) : au plus 1 contact `est_principal` et
 *     1 adresse `est_principale` par client (les lignes archivées ne comptent pas).
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

describe("Cohérence cabinet/client & unicité — crm.contact / crm.adresse", () => {
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

  // ── crm.contact ────────────────────────────────────────────────────────────

  test("contact : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.contact (cabinet_id, client_id, nom)
      VALUES (${cabinetA.id}, ${clientA.id}, 'Doe')
      RETURNING id, client_id
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("contact : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.contact (cabinet_id, client_id, nom)
        VALUES (${cabinetA.id}, ${clientB.id}, 'Cross Tenant')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("contact : au plus 1 est_principal par client (index partiel)", async () => {
    await sql`
      INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal)
      VALUES (${cabinetA.id}, ${clientA.id}, 'Principal 1', true)
    `;
    await expect(
      sql`
        INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal)
        VALUES (${cabinetA.id}, ${clientA.id}, 'Principal 2', true)
      `,
    ).rejects.toThrow(/uniq_contact_principal_per_client/);
  });

  test("contact : un est_principal archivé ne bloque pas un nouveau principal", async () => {
    await sql`
      INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal, archived_at)
      VALUES (${cabinetB.id}, ${clientB.id}, 'Ancien principal', true, now())
    `;
    const rows = await sql`
      INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal)
      VALUES (${cabinetB.id}, ${clientB.id}, 'Nouveau principal', true)
      RETURNING id
    `;
    expect(rows[0]?.id).toBeDefined();
  });

  // ── crm.adresse ────────────────────────────────────────────────────────────

  test("adresse : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.adresse (cabinet_id, client_id, type, ville)
      VALUES (${cabinetA.id}, ${clientA.id}, 'siege', 'Genève')
      RETURNING id, client_id
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("adresse : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.adresse (cabinet_id, client_id, type, ville)
        VALUES (${cabinetA.id}, ${clientB.id}, 'siege', 'Zurich')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("adresse : au plus 1 est_principale par client (index partiel)", async () => {
    await sql`
      INSERT INTO crm.adresse (cabinet_id, client_id, type, est_principale)
      VALUES (${cabinetA.id}, ${clientA.id}, 'facturation', true)
    `;
    await expect(
      sql`
        INSERT INTO crm.adresse (cabinet_id, client_id, type, est_principale)
        VALUES (${cabinetA.id}, ${clientA.id}, 'postale', true)
      `,
    ).rejects.toThrow(/uniq_adresse_principale_per_client/);
  });

  test("adresse : pays par défaut 'CH' quand non fourni", async () => {
    const rows = await sql`
      INSERT INTO crm.adresse (cabinet_id, client_id, type)
      VALUES (${cabinetB.id}, ${clientB.id}, 'postale')
      RETURNING pays
    `;
    expect(rows[0]?.pays).toBe("CH");
  });
});
