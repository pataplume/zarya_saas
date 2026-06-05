/**
 * Boucle doc→échéance end-to-end (migration 0044) : enrichissement des templates +
 * backfill + couverture C4 avec le VRAI vocabulaire du catalogue.
 *
 * Vérifie :
 *  1. les templates globaux portent désormais documents_requis_types (mapping validé) ;
 *  2. le backfill (même logique que 0029) peuple echeance.documents_requis depuis le
 *     template + les document_attendu du client de type matchant ;
 *  3. couvrirEcheancesParDocumentAttendu passe l'échéance à `traitee` une fois la pièce reçue.
 */

import { randomUUID } from "node:crypto";
import { couvrirEcheancesParDocumentAttendu } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Boucle doc→échéance (migration 0044)", () => {
  let sql: postgres.Sql;
  let cab: TestCabinet;
  let cabB: TestCabinet;
  let clientId: string;
  let tvaTemplateId: string;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cab = r.cabinetA;
    cabB = r.cabinetB;
    clientId = (await seedClient(sql, cab.id)).id;
    const [tpl] = (await sql`
      SELECT id FROM calendar.template_echeance
      WHERE cabinet_id IS NULL AND nom = 'TVA trimestrielle (effective)'
      LIMIT 1
    `) as unknown as { id: string }[];
    tvaTemplateId = tpl?.id ?? "";
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cab.id, cabB.id);
    await sql.end();
  });

  test("les templates globaux portent documents_requis_types (mapping validé)", async () => {
    const rows = (await sql`
      SELECT nom, documents_requis_types FROM calendar.template_echeance
      WHERE cabinet_id IS NULL AND nom = ANY(${sql.array([
        "TVA trimestrielle (effective)",
        "Certificat de salaire annuel",
        "Décompte annuel AVS/AC",
        "Bouclement annuel",
      ])})
      ORDER BY nom
    `) as unknown as { nom: string; documents_requis_types: string[] | null }[];
    const map = Object.fromEntries(rows.map((r) => [r.nom, r.documents_requis_types]));
    expect(map["TVA trimestrielle (effective)"]).toEqual(["declaration_tva"]);
    expect(map["Certificat de salaire annuel"]).toEqual(["certificat_salaire"]);
    expect(map["Décompte annuel AVS/AC"]).toEqual(["declaration_avs"]);
    expect(map["Bouclement annuel"]).toEqual(["releve_bancaire"]);
  });

  test("backfill : documents_requis peuplé depuis template + document_attendu ; couverture C4", async () => {
    expect(tvaTemplateId).toBeTruthy();
    // Pièce attendue du client, type aligné sur le template TVA ; déjà reçue.
    const attenduId = randomUUID();
    await sql`
      INSERT INTO crm.document_attendu (id, cabinet_id, client_id, type_document, frequence, statut_periode_courante)
      VALUES (${attenduId}, ${cab.id}, ${clientId}, 'declaration_tva', 'trimestrielle', 'recu')
    `;
    // Échéance générée AVANT enrichissement → documents_requis NULL.
    const echId = randomUUID();
    await sql`
      INSERT INTO crm.echeance (id, cabinet_id, client_id, template_id, type, libelle, date_echeance, statut, documents_requis)
      VALUES (${echId}, ${cab.id}, ${clientId}, ${tvaTemplateId}, 'tva', 'TVA Q1', current_date + 20, 'a_venir', NULL)
    `;

    // Backfill (réplique 0044), scopé au client pour ne pas toucher d'autres données.
    await sql`
      UPDATE crm.echeance e
      SET documents_requis = sub.ids, updated_at = now()
      FROM (
        SELECT e2.id AS echeance_id, array_agg(da.id) AS ids
        FROM crm.echeance e2
        JOIN calendar.template_echeance t ON t.id = e2.template_id
        JOIN crm.document_attendu da
          ON da.client_id = e2.client_id AND da.cabinet_id = e2.cabinet_id
         AND da.archived_at IS NULL
         AND t.documents_requis_types IS NOT NULL
         AND da.type_document = ANY(t.documents_requis_types)
        WHERE e2.documents_requis IS NULL AND e2.archived_at IS NULL
          AND e2.client_id = ${clientId}
        GROUP BY e2.id
      ) sub
      WHERE e.id = sub.echeance_id
    `;

    const [afterBackfill] = (await sql`
      SELECT documents_requis FROM crm.echeance WHERE id = ${echId}
    `) as unknown as { documents_requis: string[] | null }[];
    expect(afterBackfill?.documents_requis).toContain(attenduId);

    // Couverture C4 : la pièce reçue passe l'échéance à `traitee`.
    await couvrirEcheancesParDocumentAttendu(cab.id, clientId, attenduId);
    const [covered] = (await sql`
      SELECT statut FROM crm.echeance WHERE id = ${echId}
    `) as unknown as { statut: string }[];
    expect(covered?.statut).toBe("traitee");
  });
});
