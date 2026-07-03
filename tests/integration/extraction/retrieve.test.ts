/**
 * H3a — récupération hybride (intégration DB réelle, client embeddings injecté).
 *
 * Vérifie : fusion RRF vectoriel + full-text, pertinence (le bon chunk remonte), filtre client,
 * fallback full-text si embeddings indisponibles, et ISOLATION cabinet (un chunk d'un autre
 * cabinet n'est JAMAIS récupéré, même avec un embedding identique). Réf : search.md §6.2 ; ADR 0022.
 */
import { type EmbeddingsClient, retrieveChunks } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedDocumentChunk,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;
let chunkFactureId: string;
let chunkArchiveId: string;

/** Client embeddings qui renvoie un vecteur unitaire 3584 orienté `dir` pour la requête. */
function queryClient(dir: number): EmbeddingsClient {
  return {
    async resolveModel() {
      return "bge_multilingual_gemma2";
    },
    async embeddings() {
      const v = new Array(3584).fill(0);
      v[dir % 3584] = 1;
      return { data: [{ index: 0, embedding: v }] };
    },
  };
}

async function seedChunk(
  cab: string,
  cli: string,
  text: string,
  dir: number,
): Promise<{ id: string; documentId: string }> {
  const fp = await seedFichierPhysique(sql, cab);
  const doc = await seedDocument(sql, cab, cli, fp.id);
  const c = await seedDocumentChunk(sql, cab, cli, doc.id, { text, embeddingDir: dir });
  return { id: c.id, documentId: doc.id };
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  const clientB = await seedClient(sql, cabinetB.id);

  const fac = await seedChunk(
    cabinet.id,
    client.id,
    "Facture Swisscom telecom montant total 1234 CHF",
    5,
  );
  chunkFactureId = fac.id;
  await seedChunk(cabinet.id, client.id, "Decompte salaire employe cotisations AVS", 100);
  // Cabinet B : même texte + même embedding (direction 5) → ne doit JAMAIS sortir pour cabinet A.
  await seedChunk(cabinetB.id, clientB.id, "Facture Swisscom telecom montant total", 5);

  // Document ARCHIVÉ du cabinet A (retiré volontairement) : son chunk ne doit JAMAIS être
  // récupéré (ni vectoriel ni full-text), même avec un texte/embedding pertinents.
  const arch = await seedChunk(
    cabinet.id,
    client.id,
    "Facture Swisscom telecom document archive obsolete",
    5,
  );
  chunkArchiveId = arch.id;
  await sql`UPDATE doc.document SET archived_at = now() WHERE id = ${arch.documentId}`;
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("retrieveChunks (H3a)", () => {
  test("récupère le chunk pertinent (vectoriel + full-text fusionnés)", async () => {
    const res = await retrieveChunks(
      { cabinet_id: cabinet.id, question: "Facture Swisscom telecom" },
      { client: queryClient(5) },
    );
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]?.chunk_id).toBe(chunkFactureId);
    expect(res[0]?.text_content).toContain("Swisscom");
  });

  test("ISOLATION : aucun chunk d'un autre cabinet, même embedding identique", async () => {
    const res = await retrieveChunks(
      { cabinet_id: cabinet.id, question: "Facture Swisscom telecom" },
      { client: queryClient(5) },
    );
    expect(res.every((c) => c.client_id === client.id)).toBe(true);
    // Le chunk du cabinet B (texte/embedding identiques) n'apparaît pas.
    const b =
      await sql`SELECT id FROM search.document_chunk WHERE cabinet_id = ${cabinetB.id} AND text_content LIKE 'Facture Swisscom%'`;
    const bId = b[0]?.id as string;
    expect(res.some((c) => c.chunk_id === bId)).toBe(false);
  });

  test("ARCHIVE : un chunk d'un document archivé n'est jamais récupéré (vectoriel + full-text)", async () => {
    const res = await retrieveChunks(
      { cabinet_id: cabinet.id, question: "Facture Swisscom telecom archive obsolete" },
      { client: queryClient(5) },
    );
    // Le chunk archivé partage le texte/embedding pertinent mais son document est archivé.
    expect(res.some((c) => c.chunk_id === chunkArchiveId)).toBe(false);
    // Sanity : le chunk NON archivé pertinent, lui, remonte toujours.
    expect(res.some((c) => c.chunk_id === chunkFactureId)).toBe(true);
  });

  test("fallback full-text si embeddings indisponibles", async () => {
    const noEmbed: EmbeddingsClient = {
      async resolveModel() {
        throw new Error("embeddings non configurés");
      },
      async embeddings() {
        throw new Error("ne doit pas être appelé");
      },
    };
    const res = await retrieveChunks(
      { cabinet_id: cabinet.id, question: "Swisscom telecom" },
      { client: noEmbed },
    );
    expect(res.some((c) => c.chunk_id === chunkFactureId)).toBe(true);
  });
});
