/**
 * Tests d'intégration — C4 (tracking réponse par document + maj statuts/risque).
 *
 * 1. couvrirEcheancesParDocumentAttendu : une échéance dont TOUTES les attentes requises
 *    sont reçues passe `traitee` ; une échéance avec une attente encore manquante reste
 *    ouverte.
 * 2. majEcheancesEtRisque : transition a_venir→en_retard (date dépassée) + recalcul risque
 *    déclenché pour le client concerné (recalc injecté).
 *
 * Réf : packages/extraction/src/finalize-document.ts, packages/calendar/src/echeance/
 * maj-echeances.ts, ADR 0011/0015.
 */

import { randomUUID } from "node:crypto";
import { majEcheancesEtRisque } from "@zarya/calendar";
import { couvrirEcheancesParDocumentAttendu } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

async function seedAttendu(
  sql: ReturnType<typeof createServiceClient>,
  cabinet_id: string,
  client_id: string,
  statut: "recu" | "manquant",
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.document_attendu
      (id, cabinet_id, client_id, type_document, frequence, statut_periode_courante)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${`Doc ${id.slice(0, 8)}`}, 'mensuelle', ${statut})
  `;
  return id;
}

async function seedEcheance(
  sql: ReturnType<typeof createServiceClient>,
  cabinet_id: string,
  client_id: string,
  opts: { docsRequis: string[]; offsetJours: number; statut?: string },
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.echeance
      (id, cabinet_id, client_id, type, libelle, date_echeance, statut, documents_requis)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'tva', 'TVA',
            CURRENT_DATE + ${opts.offsetJours}::int,
            ${opts.statut ?? "imminente"}, ${opts.docsRequis}::uuid[])
  `;
  return id;
}

describe("C4 — tracking réponse + maj échéances/risque", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientId: string;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientId = (await seedClient(sql, cabinetA.id)).id;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("doc reçu couvre l'échéance (toutes attentes reçues) → traitee", async () => {
    const a = await seedAttendu(sql, cabinetA.id, clientId, "recu");
    const ech = await seedEcheance(sql, cabinetA.id, clientId, { docsRequis: [a], offsetJours: 5 });
    await couvrirEcheancesParDocumentAttendu(cabinetA.id, clientId, a);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.echeance WHERE id = ${ech}`;
    expect(row?.statut).toBe("traitee");
  });

  test("attente encore manquante → échéance reste ouverte", async () => {
    const a = await seedAttendu(sql, cabinetA.id, clientId, "recu");
    const b = await seedAttendu(sql, cabinetA.id, clientId, "manquant");
    const ech = await seedEcheance(sql, cabinetA.id, clientId, {
      docsRequis: [a, b],
      offsetJours: 5,
    });
    await couvrirEcheancesParDocumentAttendu(cabinetA.id, clientId, a);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.echeance WHERE id = ${ech}`;
    expect(row?.statut).toBe("imminente");
  });

  test("majEcheancesEtRisque : date dépassée → en_retard + recalcul risque du client", async () => {
    const ech = await seedEcheance(sql, cabinetA.id, clientId, {
      docsRequis: [],
      offsetJours: -3,
      statut: "a_venir",
    });
    const recalcCalls: string[] = [];
    const res = await majEcheancesEtRisque({
      recalc: async (_cab, cid) => {
        recalcCalls.push(cid);
      },
    });
    expect(res.passees_en_retard).toBeGreaterThanOrEqual(1);
    const [row] = await sql<
      { statut: string }[]
    >`SELECT statut FROM crm.echeance WHERE id = ${ech}`;
    expect(row?.statut).toBe("en_retard");
    expect(recalcCalls).toContain(clientId);
  });
});
