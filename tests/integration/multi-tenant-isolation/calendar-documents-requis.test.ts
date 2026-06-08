/**
 * Test d'intégration — C1+ / boucle doc→échéance : fn_generer_echeances peuple
 * echeance.documents_requis EN MATCHANT SUR LE VOCABULAIRE CANONIQUE (type_code, mig 0048),
 * puis couvrirEcheancesParDocumentAttendu ferme l'échéance quand le doc est reçu.
 *
 * Le match se fait sur crm.document_attendu.type_code (slug catalogue) ∈
 * template.documents_requis_types — et NON plus sur le libellé libre type_document.
 *
 * Réf : migrations 0029/0048, echeance-schema §9, KICKOFF §C1/§C4.
 */
import { randomUUID } from "node:crypto";
import { couvrirEcheancesParDocumentAttendu } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("C1+ / boucle doc→échéance — génération + couverture via type_code", () => {
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

    // Attente du client : libellé libre + slug canonique 'declaration_tva' (catalogue).
    attenduId = randomUUID();
    await sql`
      INSERT INTO crm.document_attendu
        (id, cabinet_id, client_id, type_document, type_code, frequence, statut_periode_courante)
      VALUES (${attenduId}, ${cabinetA.id}, ${clientId}, 'Décompte TVA', 'declaration_tva',
              'trimestrielle', 'manquant')
    `;
    // Template cabinet : documents_requis_types sur le MÊME slug canonique.
    templateId = randomUUID();
    await sql`
      INSERT INTO calendar.template_echeance
        (id, cabinet_id, nom, type_echeance, frequence, service_requis, jour_du_mois,
         delai_alerte_jours, documents_requis_types, actif)
      VALUES (${templateId}, ${cabinetA.id}, 'Tpl boucle', 'personnalisee', 'mensuelle',
              NULL, 15, 7, ${["declaration_tva"]}, true)
    `;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("la génération référence le document_attendu (match sur type_code)", async () => {
    await sql`SELECT calendar.fn_generer_echeances(${cabinetA.id}::uuid, 2, CURRENT_DATE)`;
    const [row] = await sql<{ documents_requis: string[] | null }[]>`
      SELECT documents_requis FROM crm.echeance
      WHERE template_id = ${templateId} AND archived_at IS NULL
      ORDER BY date_echeance ASC LIMIT 1
    `;
    expect(row?.documents_requis).not.toBeNull();
    expect(row?.documents_requis).toContain(attenduId);
  });

  test("doc reçu → couvrirEcheancesParDocumentAttendu ferme l'échéance (traitee)", async () => {
    // Le document attendu est désormais reçu pour la période.
    await sql`
      UPDATE crm.document_attendu SET statut_periode_courante = 'recu' WHERE id = ${attenduId}
    `;
    await couvrirEcheancesParDocumentAttendu(cabinetA.id, clientId, attenduId);
    const [row] = await sql<{ statut: string }[]>`
      SELECT statut::text AS statut FROM crm.echeance
      WHERE template_id = ${templateId} AND archived_at IS NULL
      ORDER BY date_echeance ASC LIMIT 1
    `;
    expect(row?.statut).toBe("traitee");
  });
});
