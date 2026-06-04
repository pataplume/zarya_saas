/**
 * H4b — orchestration de la recherche conversationnelle (intégration DB + clients injectés).
 *
 * Vérifie : intent → récupération → génération sourcée → persistance search.requete ; chemin
 * hors-scope (refus + trace, sans récupération) ; scope cabinet. Réf : search.md §6 ; KICKOFF H4.
 */

import type { ChatModelClient } from "@zarya/extraction";
import { answerQuestion } from "@zarya/extraction";
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

// Embeddings : vecteur unitaire orienté dir 5 (aligné sur le chunk semé).
const embClient = {
  async resolveModel() {
    return "bge_multilingual_gemma2";
  },
  async embeddings() {
    const v = new Array(3584).fill(0);
    v[5] = 1;
    return { data: [{ index: 0, embedding: v }] };
  },
};

// Chat : renvoie l'intent demandé puis une réponse sourcée.
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

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  client = await seedClient(sql, cabinet.id);
  const fp = await seedFichierPhysique(sql, cabinet.id);
  const doc = await seedDocument(sql, cabinet.id, client.id, fp.id);
  await seedDocumentChunk(sql, cabinet.id, client.id, doc.id, {
    text: "Facture Swisscom telecom montant total 1234 CHF",
    embeddingDir: 5,
  });
}, 120_000);

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("answerQuestion (H4b)", () => {
  test("intent → récupération → réponse sourcée → trace search.requete", async () => {
    const res = await answerQuestion(
      {
        cabinet_id: cabinet.id,
        question: "Quel montant pour Swisscom ?",
        utilisateur_id: cabinet.user_id,
      },
      { embClient, chatClient: chatClient("factuelle", "Le montant est 1234 CHF [1].") },
    );
    expect(res.intent).toBe("factuelle");
    expect(res.nb_chunks).toBeGreaterThan(0);
    expect(res.answer).toContain("1234");
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.requete_id).toBeTruthy();

    const [row] =
      await sql`SELECT intent_detecte, nb_chunks_recuperes, reponse_text FROM search.requete WHERE id = ${res.requete_id}`;
    expect(row?.intent_detecte).toBe("factuelle");
    expect(Number(row?.nb_chunks_recuperes)).toBeGreaterThan(0);
  });

  test("hors-scope → refus + trace, sans génération", async () => {
    const res = await answerQuestion(
      {
        cabinet_id: cabinet.id,
        question: "Quelle est la météo demain ?",
        utilisateur_id: cabinet.user_id,
      },
      { embClient, chatClient: chatClient("hors_scope", "ne devrait pas être utilisé") },
    );
    expect(res.intent).toBe("hors_scope");
    expect(res.sources).toHaveLength(0);
    expect(res.answer).toMatch(/périmètre/i);
    expect(res.requete_id).toBeTruthy();
  });
});
