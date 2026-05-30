/**
 * Tests de cohérence cabinet/client et de reconnexion des FK fantômes — Bloc A4
 * (crm.document_attendu, migration 0012, ADR 0012).
 *
 * BLOQUANT en CI. Garanties DB de dernier rempart, testées via le service role
 * (qui bypasse la RLS — chemin où une erreur applicative pourrait écrire une ligne
 * incohérente) :
 *
 *  1. Cohérence cabinet/client (trigger trg_check_client_cabinet_document_attendu →
 *     fn_check_client_cabinet) : un document attendu ne peut pas pointer vers un
 *     client d'un AUTRE cabinet.
 *  2. Reconnexion des « FK fantômes » : les colonnes uuid posées sans contrainte dans
 *     crm.echeance / crm.relance sont devenues de vraies FK en 0012. On vérifie qu'un
 *     uuid inexistant est désormais REJETÉ (preuve que la FK est active) :
 *       - crm.echeance.service_id            → crm.service
 *       - crm.relance.document_attendu_id    → crm.document_attendu
 *       - crm.relance.destinataire_contact_id → crm.contact
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedContact,
  seedDocumentAttendu,
  seedEcheance,
  seedService,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
  type TestContact,
  type TestService,
} from "../helpers/seed";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("Cohérence cabinet/client & FK reconnectées — crm.document_attendu (A4)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let serviceA: TestService;
  let contactA: TestContact;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    serviceA = await seedService(sql, cabinetA.id, clientA.id);
    contactA = await seedContact(sql, cabinetA.id, clientA.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ── crm.document_attendu — cohérence cabinet/client ─────────────────────────

  test("document_attendu : INSERT avec client du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.document_attendu (cabinet_id, client_id, type_document, frequence)
      VALUES (${cabinetA.id}, ${clientA.id}, 'Relevé bancaire', 'mensuelle')
      RETURNING id, client_id
    `;
    expect(rows[0]?.client_id).toBe(clientA.id);
  });

  test("document_attendu : INSERT avec client d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.document_attendu (cabinet_id, client_id, type_document, frequence)
        VALUES (${cabinetA.id}, ${clientB.id}, 'Décompte TVA', 'trimestrielle')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  test("document_attendu : service_id pointant vers un service du MÊME client est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.document_attendu (cabinet_id, client_id, service_id, type_document, frequence)
      VALUES (${cabinetA.id}, ${clientA.id}, ${serviceA.id}, 'Pièces compta', 'mensuelle')
      RETURNING id, service_id
    `;
    expect(rows[0]?.service_id).toBe(serviceA.id);
  });

  // ── Reconnexion des FK fantômes (migration 0012) ────────────────────────────

  test("FK reconnectée : crm.echeance.service_id rejette un service inexistant", async () => {
    await expect(
      sql`
        INSERT INTO crm.echeance (cabinet_id, client_id, service_id, type, libelle, date_echeance)
        VALUES (${cabinetA.id}, ${clientA.id}, ${NIL_UUID}, 'tva', 'Échéance KO', now() + interval '7 days')
      `,
    ).rejects.toThrow(/echeance_service_id_fkey/);
  });

  test("FK reconnectée : crm.relance.document_attendu_id rejette un uuid inexistant", async () => {
    const echeance = await seedEcheance(sql, cabinetA.id, clientA.id);
    await expect(
      sql`
        INSERT INTO crm.relance (cabinet_id, client_id, echeance_id, document_attendu_id, canal, statut)
        VALUES (${cabinetA.id}, ${clientA.id}, ${echeance.id}, ${NIL_UUID}, 'email', 'brouillon')
      `,
    ).rejects.toThrow(/relance_document_attendu_id_fkey/);
  });

  test("FK reconnectée : crm.relance.destinataire_contact_id rejette un uuid inexistant", async () => {
    const echeance = await seedEcheance(sql, cabinetA.id, clientA.id);
    await expect(
      sql`
        INSERT INTO crm.relance (cabinet_id, client_id, echeance_id, destinataire_contact_id, canal, statut)
        VALUES (${cabinetA.id}, ${clientA.id}, ${echeance.id}, ${NIL_UUID}, 'email', 'brouillon')
      `,
    ).rejects.toThrow(/relance_destinataire_contact_id_fkey/);
  });

  test("FK reconnectée : crm.relance accepte un contact existant comme destinataire", async () => {
    const echeance = await seedEcheance(sql, cabinetA.id, clientA.id);
    const docAtt = await seedDocumentAttendu(sql, cabinetA.id, clientA.id);
    const rows = await sql`
      INSERT INTO crm.relance
        (cabinet_id, client_id, echeance_id, document_attendu_id, destinataire_contact_id, canal, statut)
      VALUES (
        ${cabinetA.id}, ${clientA.id}, ${echeance.id}, ${docAtt.id}, ${contactA.id}, 'email', 'brouillon'
      )
      RETURNING id, destinataire_contact_id, document_attendu_id
    `;
    expect(rows[0]?.destinataire_contact_id).toBe(contactA.id);
    expect(rows[0]?.document_attendu_id).toBe(docAtt.id);
  });
});
