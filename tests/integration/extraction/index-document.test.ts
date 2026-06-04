/**
 * H2b — pipeline d'indexation RAG (intégration DB réelle, client embeddings injecté).
 *
 * Vérifie : chunking + embeddings → search.document_chunk (modèle + chunk_index), trace
 * extraction.invocation, ré-indexation idempotente (purge + recréation), gating sans embeddings,
 * no-op sur texte vide, scope cabinet. Réf : search.md §4.2 ; ADR 0022 ; KICKOFF H2.
 */
import { type EmbeddingsClient, indexDocument } from "@zarya/extraction";
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

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let client: TestClient;

/** Client embeddings déterministe (3584 dim) — vecteur unitaire orienté par index de lot. */
const fakeClient: EmbeddingsClient = {
  async resolveModel() {
    return "bge_multilingual_gemma2";
  },
  async embeddings({ input }) {
    return {
      data: input.map((_, i) => {
        const v = new Array(3584).fill(0);
        v[i % 3584] = 1;
        return { index: i, embedding: v };
      }),
      usage: { prompt_tokens: input.length * 10 },
    };
  },
};

async function seedDoc(): Promise<string> {
  const fp = await seedFichierPhysique(sql, cabinet.id);
  const doc = await seedDocument(sql, cabinet.id, client.id, fp.id);
  return doc.id;
}

const LONG_TEXT = Array.from(
  { length: 8 },
  (_, i) => `Paragraphe ${i}. ${"contenu fiduciaire ".repeat(40)}`,
).join("\n\n");

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("indexDocument (H2b)", () => {
  test("indexe un document → chunks + embeddings + trace invocation", async () => {
    const documentId = await seedDoc();
    const res = await indexDocument(
      { cabinet_id: cabinet.id, document_id: documentId, client_id: client.id, text: LONG_TEXT },
      { client: fakeClient },
    );
    expect(res.indexed).toBe(true);
    expect(res.nb_chunks).toBeGreaterThan(1);
    expect(res.model).toBe("bge_multilingual_gemma2");

    const rows =
      await sql`SELECT chunk_index, embedding_model, (embedding IS NOT NULL) AS has_emb FROM search.document_chunk WHERE document_id = ${documentId} ORDER BY chunk_index`;
    expect(rows.length).toBe(res.nb_chunks);
    expect(rows.every((r) => r.has_emb === true)).toBe(true);
    expect(rows.every((r) => r.embedding_model === "bge_multilingual_gemma2")).toBe(true);
    expect(rows.map((r) => r.chunk_index)).toEqual(rows.map((_, i) => i));

    const inv =
      await sql`SELECT 1 FROM extraction.invocation WHERE input_document_id = ${documentId} AND invoked_by_module = 'search' AND status = 'success'`;
    expect(inv.length).toBeGreaterThanOrEqual(1);
  });

  test("ré-indexation idempotente : purge + recréation (pas de doublons)", async () => {
    const documentId = await seedDoc();
    const r1 = await indexDocument(
      { cabinet_id: cabinet.id, document_id: documentId, text: LONG_TEXT },
      { client: fakeClient },
    );
    const r2 = await indexDocument(
      { cabinet_id: cabinet.id, document_id: documentId, text: LONG_TEXT },
      { client: fakeClient },
    );
    expect(r2.nb_chunks).toBe(r1.nb_chunks);
    const [{ n }] =
      await sql`SELECT count(*)::int AS n FROM search.document_chunk WHERE document_id = ${documentId}`;
    expect(n).toBe(r1.nb_chunks); // pas doublé
  });

  test("texte vide → no-op (no_text), aucun chunk", async () => {
    const documentId = await seedDoc();
    const res = await indexDocument(
      { cabinet_id: cabinet.id, document_id: documentId, text: "   " },
      { client: fakeClient },
    );
    expect(res.indexed).toBe(false);
    expect(res.reason).toBe("no_text");
  });

  test("embeddings non configurés → no-op (gated), aucun chunk", async () => {
    const documentId = await seedDoc();
    const noEmbed: EmbeddingsClient = {
      async resolveModel() {
        throw new Error("IK_MODEL_EMBEDDINGS absent");
      },
      async embeddings() {
        throw new Error("ne doit pas être appelé");
      },
    };
    const res = await indexDocument(
      { cabinet_id: cabinet.id, document_id: documentId, text: LONG_TEXT },
      { client: noEmbed },
    );
    expect(res.indexed).toBe(false);
    expect(res.reason).toBe("embeddings_non_configure");
    const [{ n }] =
      await sql`SELECT count(*)::int AS n FROM search.document_chunk WHERE document_id = ${documentId}`;
    expect(n).toBe(0);
  });
});
