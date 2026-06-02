/**
 * Test d'intégration — C1+ : fn_generer_echeances peuple echeance.documents_requis.
 *
 * Vérifie que la génération relie l'échéance aux crm.document_attendu du client dont
 * type_document figure dans template.documents_requis_types (clé documentée) — prérequis
 * de la couverture C4 (doc reçu → échéance traitee).
 *
 * Réf : migration 0029, echeance-schema §9.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("C1+ — génération peuple documents_requis", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientId: string;
  let templateId: string;
  let attenduId: string;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientId = (await seedClient(sql, cabinetA.id)).id;

    // Attente du client : type_document 'Releve_C1plus'.
    attenduId = randomUUID();
    await sql`
      INSERT INTO crm.document_attendu
        (id, cabinet_id, client_id, type_document, frequence, statut_periode_courante)
      VALUES (${attenduId}, ${cabinetA.id}, ${clientId}, 'Releve_C1plus', 'mensuelle', 'manquant')
    `;
    // Template cabinet : mensuel, sans service requis, documents_requis_types alignés.
    templateId = randomUUID();
    await sql`
      INSERT INTO calendar.template_echeance
        (id, cabinet_id, nom, type_echeance, frequence, service_requis, jour_du_mois,
         delai_alerte_jours, documents_requis_types, actif)
      VALUES (${templateId}, ${cabinetA.id}, 'Tpl C1plus', 'personnalisee', 'mensuelle',
              NULL, 15, 7, ${["Releve_C1plus"]}, true)
    `;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("l'échéance générée référence le document_attendu dans documents_requis", async () => {
    await sql`SELECT calendar.fn_generer_echeances(${cabinetA.id}::uuid, 2, CURRENT_DATE)`;
    const [row] = await sql<{ documents_requis: string[] | null }[]>`
      SELECT documents_requis FROM crm.echeance
      WHERE template_id = ${templateId} AND archived_at IS NULL
      ORDER BY date_echeance ASC LIMIT 1
    `;
    expect(row?.documents_requis).not.toBeNull();
    expect(row?.documents_requis).toContain(attenduId);
  });
});
