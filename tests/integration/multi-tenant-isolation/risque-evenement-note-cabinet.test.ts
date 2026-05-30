/**
 * Tests de cohérence cabinet/client et de contraintes — crm.risque, crm.evenement,
 * crm.note (Bloc A8, migration 0016, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (triggers trg_check_client_cabinet_{risque,evenement,note}
 *     → fn_check_client_cabinet) : une ligne ne peut pas pointer vers un client d'un
 *     AUTRE cabinet.
 *  2. crm.risque : 1-1 strict avec le client (client_id = PK) — seconde ligne rejetée.
 *  3. crm.evenement : client_id NULLABLE accepté (événement cabinet-level) ; le trigger
 *     tolère client_id NULL (fn_check_client_cabinet garde `IF NEW.client_id IS NOT NULL`).
 *  4. crm.note : FK client_id réelle + contenu NOT NULL.
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

describe("Cohérence cabinet/client & contraintes — crm.risque / evenement / note (A8)", () => {
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

  // ─── crm.risque ────────────────────────────────────────────────────────────

  test("risque : INSERT avec client du MÊME cabinet est accepté (DEFAULTs score/drapeau)", async () => {
    const rows = await sql`
      INSERT INTO crm.risque (client_id, cabinet_id)
      VALUES (${clientA.id}, ${cabinetA.id})
      RETURNING client_id, score, drapeau_critique
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
    expect(rows[0]?.score).toBe(0);
    expect(rows[0]?.drapeau_critique).toBe(false);
  });

  test("risque : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.risque (client_id, cabinet_id)
        VALUES (${clientB.id}, ${cabinetA.id})
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("risque : 1-1 strict — une seconde ligne pour le même client est rejetée", async () => {
    // clientA a déjà sa ligne (1er test) → re-insérer viole la PK client_id.
    await expect(
      sql`
        INSERT INTO crm.risque (client_id, cabinet_id)
        VALUES (${clientA.id}, ${cabinetA.id})
      `,
    ).rejects.toThrow(/risque_pkey/);
  });

  // ─── crm.evenement ───────────────────────────────────────────────────────────

  test("evenement : INSERT lié au client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.evenement (cabinet_id, client_id, type)
      VALUES (${cabinetA.id}, ${clientA.id}, 'document_recu')
      RETURNING id, client_id
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("evenement : INSERT cabinet-level (client_id NULL) est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.evenement (cabinet_id, client_id, type)
      VALUES (${cabinetA.id}, ${null}, 'cabinet_membre_ajoute')
      RETURNING id, client_id
    `;
    expect(rows[0]?.id).toBeTruthy();
    expect(rows[0]?.client_id).toBeNull();
  });

  test("evenement : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.evenement (cabinet_id, client_id, type)
        VALUES (${cabinetA.id}, ${clientB.id}, 'document_recu')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  // ─── crm.note ────────────────────────────────────────────────────────────────

  test("note : INSERT lié au client du MÊME cabinet est accepté (DEFAULTs epingle/visibilite)", async () => {
    const rows = await sql`
      INSERT INTO crm.note (cabinet_id, client_id, contenu)
      VALUES (${cabinetA.id}, ${clientA.id}, ${"Note de test A8"})
      RETURNING id, epingle, visibilite
    `;
    expect(rows[0]?.id).toBeTruthy();
    expect(rows[0]?.epingle).toBe(false);
    expect(rows[0]?.visibilite).toBe("cabinet");
  });

  test("note : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.note (cabinet_id, client_id, contenu)
        VALUES (${cabinetA.id}, ${clientB.id}, ${"Note incohérente"})
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("note : contenu NOT NULL — une note sans contenu est rejetée", async () => {
    await expect(
      sql`
        INSERT INTO crm.note (cabinet_id, client_id, contenu)
        VALUES (${cabinetA.id}, ${clientA.id}, ${null})
      `,
    ).rejects.toThrow(/contenu/);
  });
});
