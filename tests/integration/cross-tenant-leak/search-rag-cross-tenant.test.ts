/**
 * H5 — Test cross-tenant ADVERSARIAL du chemin RAG (bloquant CI).
 *
 * Le test générique `generic-leak.test.ts` couvre l'isolation table-level (SELECT/UPDATE/
 * DELETE scopés). Ce test-ci couvre la lacune spécifique au Bloc H : le chemin de
 * RÉCUPÉRATION RAG (`retrieveChunks`) et l'orchestration (`answerQuestion`). Il rejoue le
 * scénario adverse exigé par le KICKOFF H5 :
 *
 *   « un utilisateur du cabinet A pose une question qui matche SÉMANTIQUEMENT et
 *     LEXICALEMENT des documents du cabinet B → 0 résultat de B. »
 *
 * Pour rendre l'attaque réaliste, les deux cabinets contiennent un chunk au **texte
 * identique** et au **même vecteur d'embedding** : sans le filtre `cabinet_id` discipliné
 * (la RLS étant contournée par le service role, cf. ADR 0005 addendum), le chunk de B
 * remonterait. On vérifie les DEUX modalités de récupération (full-text ET vectorielle) +
 * le bout-en-bout `answerQuestion` (les sources citées n'appartiennent qu'au cabinet A).
 */

import type { ChatModelClient } from "@zarya/extraction";
import { answerQuestion, retrieveChunks } from "@zarya/extraction";
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
} from "../helpers/seed";

const sql = createServiceClient();

// Contenu IDENTIQUE dans les deux cabinets : l'isolation ne peut donc PAS reposer sur une
// différence de texte ou de vecteur — uniquement sur le filtre `cabinet_id`.
const SHARED_TEXT = "Le salaire AVS de Frédéric Martin pour la période est de 5500 CHF.";
// Tous les lexèmes de la question figurent dans SHARED_TEXT : plainto_tsquery faisant un AND
// des termes, on évite un mot interrogatif absent du texte (« Quel ») qui casserait le match.
const QUESTION = "salaire AVS de Frédéric Martin";
const EMB_DIR = 3;

// Embeddings : vecteur unitaire orienté EMB_DIR (aligné sur les deux chunks semés).
const embClient = {
  async resolveModel() {
    return "bge_multilingual_gemma2";
  },
  async embeddings() {
    const v = new Array(3584).fill(0);
    v[EMB_DIR] = 1;
    return { data: [{ index: 0, embedding: v }] };
  },
};

// Embeddings indisponibles → force la branche full-text seule.
const embClientDown = {
  async resolveModel(): Promise<string> {
    throw new Error("embeddings indisponibles (test)");
  },
  async embeddings(): Promise<{ data: { index: number; embedding: number[] }[] }> {
    throw new Error("embeddings indisponibles (test)");
  },
};

function chatClient(intent: string, answer: string): ChatModelClient {
  let call = 0;
  return {
    async resolveModel() {
      return "qwen-large";
    },
    async chatCompletion() {
      call += 1;
      const content = call === 1 ? JSON.stringify({ intent }) : answer;
      return {
        model: "qwen-large",
        choices: [
          { index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
    },
  };
}

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let docAId: string;
let docBId: string;
let chunkAId: string;
let chunkBId: string;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;

  const [clientA, clientB] = [
    await seedClient(sql, cabinetA.id),
    await seedClient(sql, cabinetB.id),
  ];
  const [fpA, fpB] = [
    await seedFichierPhysique(sql, cabinetA.id),
    await seedFichierPhysique(sql, cabinetB.id),
  ];
  const [docA, docB] = [
    await seedDocument(sql, cabinetA.id, clientA.id, fpA.id),
    await seedDocument(sql, cabinetB.id, clientB.id, fpB.id),
  ];
  docAId = docA.id;
  docBId = docB.id;
  const [chunkA, chunkB] = [
    await seedDocumentChunk(sql, cabinetA.id, clientA.id, docA.id, {
      text: SHARED_TEXT,
      embeddingDir: EMB_DIR,
    }),
    await seedDocumentChunk(sql, cabinetB.id, clientB.id, docB.id, {
      text: SHARED_TEXT,
      embeddingDir: EMB_DIR,
    }),
  ];
  chunkAId = chunkA.id;
  chunkBId = chunkB.id;
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("H5 — cross-tenant RAG (chemin applicatif, db service role)", () => {
  test("retrieveChunks (branche full-text) : cabinet A ne voit jamais le chunk de B", async () => {
    const rows = await retrieveChunks(
      { cabinet_id: cabinetA.id, question: QUESTION },
      { client: embClientDown },
    );
    const ids = rows.map((c) => c.chunk_id);
    const docs = rows.map((c) => c.document_id);
    expect(ids).toContain(chunkAId);
    expect(ids).not.toContain(chunkBId);
    expect(docs).not.toContain(docBId);
    // Tout résultat appartient bien au cabinet A (document de A).
    expect(docs.every((d) => d === docAId)).toBe(true);
  });

  test("retrieveChunks (branche vectorielle) : cabinet A ne voit jamais le chunk de B", async () => {
    const rows = await retrieveChunks(
      { cabinet_id: cabinetA.id, question: QUESTION },
      { client: embClient },
    );
    const ids = rows.map((c) => c.chunk_id);
    expect(ids).toContain(chunkAId);
    expect(ids).not.toContain(chunkBId);
    expect(rows.every((c) => c.document_id === docAId)).toBe(true);
  });

  test("retrieveChunks : cabinet B ne voit jamais le chunk de A (symétrie)", async () => {
    const rows = await retrieveChunks(
      { cabinet_id: cabinetB.id, question: QUESTION },
      { client: embClient },
    );
    const ids = rows.map((c) => c.chunk_id);
    expect(ids).toContain(chunkBId);
    expect(ids).not.toContain(chunkAId);
  });

  test("answerQuestion (bout-en-bout) : les sources citées n'appartiennent qu'au cabinet A", async () => {
    const res = await answerQuestion(
      { cabinet_id: cabinetA.id, question: QUESTION, utilisateur_id: cabinetA.user_id },
      { embClient, chatClient: chatClient("factuelle", "Le salaire AVS est 5500 CHF [1].") },
    );
    const sourceDocs = res.sources.map((s) => s.document_id);
    expect(sourceDocs.length).toBeGreaterThan(0);
    expect(sourceDocs).toContain(docAId);
    expect(sourceDocs).not.toContain(docBId);
    expect(sourceDocs.every((d) => d === docAId)).toBe(true);
  });
});
