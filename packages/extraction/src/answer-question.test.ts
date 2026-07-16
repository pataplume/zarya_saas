// P0-4 — Tests UNITAIRES de l'orchestration answerQuestion (agrégations câblées + réponse vide).
// @zarya/db est entièrement mocké (le module client.ts n'est JAMAIS évalué → zéro connexion) ;
// la récupération RAG (./retrieve) est mockée. Complète les tests d'intégration
// tests/integration/extraction/answer-question.test.ts (chemins DB réels).

import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertedRows, insertSpy, executeSpy } = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const insert = vi.fn((_table: unknown) => ({
    values: (row: Record<string, unknown>) => {
      rows.push(row);
      return { returning: async () => [{ id: "req-1" }] };
    },
  }));
  const execute = vi.fn(async () => [
    { type: "facture", n: 2 },
    { type: "contrat", n: 1 },
  ]);
  return { insertedRows: rows, insertSpy: insert, executeSpy: execute };
});

vi.mock("@zarya/db", () => ({
  db: { insert: insertSpy, execute: executeSpy },
  searchRequete: { __table: "search_requete" },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock("./retrieve", () => ({
  BGE_QUERY_INSTRUCTION: "",
  retrieveChunks: vi.fn(async () => [
    {
      chunk_id: "c1",
      document_id: "d1",
      client_id: null,
      text_content: "Facture Swisscom total 1234 CHF",
      score: 1,
    },
  ]),
}));

import { answerQuestion } from "./answer-question";
import type { ChatModelClient } from "./infomaniak-classifier";
import { retrieveChunks } from "./retrieve";

/** Client chat qui renvoie les contenus dans l'ordre (le dernier se répète). */
function chatSequence(contents: string[]): {
  client: ChatModelClient;
  spy: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const spy = vi.fn(async () => {
    const content = contents[Math.min(i, contents.length - 1)] ?? "";
    i += 1;
    return {
      model: "m",
      choices: [
        { index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  });
  const client: ChatModelClient = { resolveModel: async () => "m", chatCompletion: spy };
  return { client, spy };
}

const BASE = { cabinet_id: "cab-A", utilisateur_id: "user-1" };

beforeEach(() => {
  insertedRows.length = 0;
  insertSpy.mockClear();
  executeSpy.mockClear();
  vi.mocked(retrieveChunks).mockClear();
});

describe("answerQuestion — intent agregation câblé (P0-4)", () => {
  it("template matché → réponse chiffrée déterministe (pas de RAG), scopée cabinet, tracée", async () => {
    const { client, spy } = chatSequence([
      JSON.stringify({ intent: "agregation" }),
      JSON.stringify({ template_id: "compter_documents_par_type", annee: 2026 }),
    ]);
    const res = await answerQuestion(
      { ...BASE, question: "Combien de documents en 2026 ?" },
      { chatClient: client },
    );

    expect(res.intent).toBe("agregation");
    expect(res.answer).toContain("3 documents au total");
    expect(res.answer).toContain("facture : 2");
    expect(res.answer).toMatch(/calculé directement sur la base documentaire/i);
    expect(res.sources).toEqual([]);
    expect(res.nb_chunks).toBe(0);
    expect(res.requete_id).toBe("req-1");

    // 2 appels LLM seulement (intent + sélection) : AUCUNE génération RAG textuelle.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(retrieveChunks)).not.toHaveBeenCalled();

    // La requête paramétrée est exécutée avec le cabinet_id IMPOSÉ par l'appelant.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const query = (executeSpy as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | { values?: unknown[] }
      | undefined;
    expect(query?.values?.[0]).toBe("cab-A");

    // Trace search.requete comme le reste.
    expect(insertedRows[0]?.cabinet_id).toBe("cab-A");
    expect(insertedRows[0]?.intent_detecte).toBe("agregation");
    expect(String(insertedRows[0]?.reponse_text)).toContain("3 documents au total");
  });

  it("aucun template ne matche → repli RAG textuel (comportement antérieur)", async () => {
    const { client, spy } = chatSequence([
      JSON.stringify({ intent: "agregation" }),
      JSON.stringify({ template_id: "aucun", annee: null }),
      "Réponse textuelle [1].",
    ]);
    const res = await answerQuestion(
      { ...BASE, question: "Combien de fois le mot « résiliation » apparaît ?" },
      { chatClient: client },
    );

    expect(res.intent).toBe("agregation");
    expect(res.answer).toBe("Réponse textuelle [1].");
    expect(res.sources).toHaveLength(1);
    expect(executeSpy).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(3); // intent + sélection + génération RAG
  });
});

describe("answerQuestion — génération vide (bug prod 16.07)", () => {
  it("réponse vide malgré réessai → message dégradé explicite + sources conservées", async () => {
    const { client } = chatSequence([JSON.stringify({ intent: "factuelle" }), "", ""]);
    const res = await answerQuestion(
      { ...BASE, question: "Quel montant pour Swisscom ?" },
      { chatClient: client },
    );

    // Jamais answer:"" : le mode dégradé garde les sources et un message explicite.
    expect(res.answer).toMatch(/momentanément indisponible/i);
    expect(res.sources).toHaveLength(1);
    expect(res.nb_chunks).toBe(1);
    expect(res.requete_id).toBe("req-1");
    expect(String(insertedRows[0]?.reponse_text)).toMatch(/indisponible/i);
  });
});
