/**
 * Backfill d'indexation RAG : indexPendingDocuments sélectionne les doc.document validés
 * AYANT un texte OCR et NON encore indexés (pas de chunk dans search.document_chunk), et
 * saute ceux déjà indexés ou sans texte. Réf : recherche ne couvrait que 6/74 docs en prod.
 */
import { randomUUID } from "node:crypto";
import type { IndexDocumentInput } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { indexPendingDocuments } from "../../../apps/web/lib/index-pending-documents";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedDocumentChunk,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

describe("Backfill indexation RAG (indexPendingDocuments)", () => {
  let sql: postgres.Sql;
  let cab: TestCabinet;
  let cabB: TestCabinet;
  let clientId: string;
  let docAvecTexte: string;
  let docDejaIndexe: string;
  let docSansTexte: string;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cab = r.cabinetA;
    cabB = r.cabinetB;
    clientId = (await seedClient(sql, cab.id)).id;

    // Doc A : fichier avec texte OCR, non indexé → DOIT être indexé.
    const fpA = await seedFichierPhysique(sql, cab.id);
    await sql`UPDATE doc.fichier_physique SET ocr_text = 'Relevé bancaire UBS avril 2026, solde 1234.' WHERE id = ${fpA.id}`;
    docAvecTexte = (await seedDocument(sql, cab.id, clientId, fpA.id)).id;

    // Doc B : texte OCR MAIS déjà un chunk → DOIT être sauté.
    const fpB = await seedFichierPhysique(sql, cab.id);
    await sql`UPDATE doc.fichier_physique SET ocr_text = 'Facture Swisscom 89 CHF.' WHERE id = ${fpB.id}`;
    docDejaIndexe = (await seedDocument(sql, cab.id, clientId, fpB.id)).id;
    await seedDocumentChunk(sql, cab.id, clientId, docDejaIndexe);

    // Doc C : aucun texte OCR → DOIT être sauté.
    const fpC = await seedFichierPhysique(sql, cab.id);
    docSansTexte = (await seedDocument(sql, cab.id, clientId, fpC.id)).id;
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cab.id, cabB.id);
    await sql.end();
  });

  test("indexe uniquement les documents validés avec texte et non encore indexés", async () => {
    const indexSpy = vi.fn(async (_input: IndexDocumentInput) => ({
      indexed: true as const,
      nb_chunks: 2,
    }));

    const res = await indexPendingDocuments({ cabinet_id: cab.id, deps: { index: indexSpy } });

    expect(res.indexes).toBe(1);
    expect(res.chunks).toBe(2);
    expect(indexSpy).toHaveBeenCalledTimes(1);
    const called = indexSpy.mock.calls[0]?.[0];
    expect(called?.document_id).toBe(docAvecTexte);
    expect(called?.text).toContain("UBS");
    // Ni le doc déjà indexé, ni le doc sans texte ne sont passés à l'indexation.
    const ids = indexSpy.mock.calls.map((c) => c[0].document_id);
    expect(ids).not.toContain(docDejaIndexe);
    expect(ids).not.toContain(docSansTexte);
  });
});
