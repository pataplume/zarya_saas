/**
 * Tests de cohérence cabinet/client et de contraintes — crm.salaire_config
 * (Bloc A7, migration 0015, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (trigger trg_check_client_cabinet_salaire_config →
 *     fn_check_client_cabinet) : une config salaires ne peut pas pointer vers un
 *     client d'un AUTRE cabinet.
 *  2. 1-1 strict avec le client (client_id = PK) : une seconde config pour le même
 *     client est rejetée.
 *  3. contact_rh_id est une vraie FK vers crm.contact : un uuid inexistant est rejeté ;
 *     un contact du même client est accepté.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedContact,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("Cohérence cabinet/client & contraintes — crm.salaire_config (A7)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let contactA_id: string;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    const contactA = await seedContact(sql, cabinetA.id, clientA.id);
    contactA_id = contactA.id;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("salaire_config : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.salaire_config (client_id, cabinet_id, nombre_employes)
      VALUES (${clientA.id}, ${cabinetA.id}, 5)
      RETURNING client_id, frequence_paie, envoi_automatique_relance
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
    // DEFAULTs appliqués par la DB.
    expect(rows[0]?.frequence_paie).toBe("mensuelle");
    expect(rows[0]?.envoi_automatique_relance).toBe(false);
  });

  test("salaire_config : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.salaire_config (client_id, cabinet_id)
        VALUES (${clientB.id}, ${cabinetA.id})
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("salaire_config : 1-1 strict — une seconde config pour le même client est rejetée", async () => {
    // clientA a déjà sa ligne (1er test) → re-insérer viole la PK client_id.
    await expect(
      sql`
        INSERT INTO crm.salaire_config (client_id, cabinet_id)
        VALUES (${clientA.id}, ${cabinetA.id})
      `,
    ).rejects.toThrow(/salaire_config_pkey/);
  });

  test("salaire_config : contact_rh_id pointant vers un contact inexistant est rejeté (FK)", async () => {
    await expect(
      sql`
        UPDATE crm.salaire_config
        SET contact_rh_id = ${NIL_UUID}
        WHERE client_id = ${clientA.id}
      `,
    ).rejects.toThrow(/salaire_config_contact_rh_id_fkey/);
  });

  test("salaire_config : contact_rh_id pointant vers un contact existant est accepté", async () => {
    const rows = await sql`
      UPDATE crm.salaire_config
      SET contact_rh_id = ${contactA_id}
      WHERE client_id = ${clientA.id}
      RETURNING contact_rh_id
    `;
    expect(rows[0]?.contact_rh_id).toBe(contactA_id);
  });
});
