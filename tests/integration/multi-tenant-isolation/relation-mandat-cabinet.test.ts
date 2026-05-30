/**
 * Tests de cohérence cabinet/client et de contraintes — crm.relation & crm.mandat
 * (Bloc A5, migration 0013, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (triggers trg_check_client_cabinet_{relation,mandat}
 *     → fn_check_client_cabinet) : une relation / un mandat ne peut pas pointer vers
 *     un client d'un AUTRE cabinet.
 *  2. crm.relation : 1-1 strict avec le client (client_id = PK).
 *  3. crm.mandat : document_id est une vraie FK vers doc.document (un uuid inexistant
 *     est rejeté) ; un document du même cabinet est accepté.
 */
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

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("Cohérence cabinet/client & contraintes — crm.relation / crm.mandat (A5)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let documentA_id: string;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    const fpA = await seedFichierPhysique(sql, cabinetA.id);
    const docA = await seedDocument(sql, cabinetA.id, clientA.id, fpA.id);
    documentA_id = docA.id;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ── crm.relation ────────────────────────────────────────────────────────────

  test("relation : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.relation (client_id, cabinet_id, honoraires_modele)
      VALUES (${clientA.id}, ${cabinetA.id}, 'forfait')
      RETURNING client_id, honoraires_modele
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("relation : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.relation (client_id, cabinet_id, honoraires_modele)
        VALUES (${clientB.id}, ${cabinetA.id}, 'regie')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("relation : 1-1 strict — une seconde relation pour le même client est rejetée", async () => {
    // clientA a déjà sa ligne (test précédent) → re-insérer viole la PK client_id.
    await expect(
      sql`
        INSERT INTO crm.relation (client_id, cabinet_id, honoraires_modele)
        VALUES (${clientA.id}, ${cabinetA.id}, 'mixte')
      `,
    ).rejects.toThrow(/relation_pkey/);
  });

  // ── crm.mandat ────────────────────────────────────────────────────────────

  test("mandat : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.mandat (cabinet_id, client_id, date_signature, date_effet)
      VALUES (${cabinetA.id}, ${clientA.id}, current_date, current_date)
      RETURNING id, client_id, statut
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
    expect(rows[0]?.statut).toBe("actif");
  });

  test("mandat : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.mandat (cabinet_id, client_id, date_signature, date_effet)
        VALUES (${cabinetA.id}, ${clientB.id}, current_date, current_date)
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("mandat : document_id pointant vers un doc.document inexistant est rejeté (FK)", async () => {
    await expect(
      sql`
        INSERT INTO crm.mandat (cabinet_id, client_id, date_signature, date_effet, document_id)
        VALUES (${cabinetA.id}, ${clientA.id}, current_date, current_date, ${NIL_UUID})
      `,
    ).rejects.toThrow(/mandat_document_id_fkey/);
  });

  test("mandat : document_id pointant vers un doc.document existant est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.mandat (cabinet_id, client_id, date_signature, date_effet, document_id)
      VALUES (${cabinetA.id}, ${clientA.id}, current_date, current_date, ${documentA_id})
      RETURNING id, document_id
    `;
    expect(rows[0]?.document_id).toBe(documentA_id);
  });
});
