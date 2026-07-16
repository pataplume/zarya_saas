import { describe, expect, it, vi } from "vitest";

// On mocke @zarya/db (importé par aggregation-templates pour le catalogue) : AUCUNE connexion
// réelle — le module client.ts n'est jamais évalué.
vi.mock("@zarya/db", () => ({
  db: {},
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

import type { ChatModelClient } from "./infomaniak-classifier";
import { selectAggregationTemplate } from "./select-aggregation";

function chatReturning(content: string): ChatModelClient {
  return {
    resolveModel: async () => "ministral-3-14b",
    chatCompletion: vi.fn(async () => ({
      model: "ministral-3-14b",
      choices: [
        { index: 0, message: { role: "assistant" as const, content }, finish_reason: "stop" },
      ],
    })),
  };
}

describe("selectAggregationTemplate", () => {
  it("template du catalogue + année → sélection avec params typés", async () => {
    const res = await selectAggregationTemplate("Combien de documents en 2026 ?", {
      client: chatReturning(
        JSON.stringify({ template_id: "compter_documents_par_type", annee: 2026 }),
      ),
    });
    expect(res).toEqual({ template_id: "compter_documents_par_type", params: { annee: 2026 } });
  });

  it("annee null → params vides ; annee hors bornes → ignorée", async () => {
    const sans = await selectAggregationTemplate("Combien de documents ?", {
      client: chatReturning(
        JSON.stringify({ template_id: "compter_documents_par_type", annee: null }),
      ),
    });
    expect(sans).toEqual({ template_id: "compter_documents_par_type", params: {} });

    const horsBornes = await selectAggregationTemplate("Combien de documents en 1999 ?", {
      client: chatReturning(
        JSON.stringify({ template_id: "compter_documents_par_type", annee: 1999 }),
      ),
    });
    expect(horsBornes).toEqual({ template_id: "compter_documents_par_type", params: {} });
  });

  it("« aucun » ou id hors catalogue → null (repli RAG)", async () => {
    expect(
      await selectAggregationTemplate("Résume le contrat ?", {
        client: chatReturning(JSON.stringify({ template_id: "aucun", annee: null })),
      }),
    ).toBeNull();

    expect(
      await selectAggregationTemplate("Combien ?", {
        client: chatReturning(JSON.stringify({ template_id: "DROP TABLE doc.document" })),
      }),
    ).toBeNull();
  });

  it("échec LLM ou JSON invalide → null, ne lève jamais", async () => {
    const failing: ChatModelClient = {
      resolveModel: async () => "m",
      chatCompletion: async () => {
        throw new Error("LLM down");
      },
    };
    expect(await selectAggregationTemplate("Combien ?", { client: failing })).toBeNull();
    expect(
      await selectAggregationTemplate("Combien ?", { client: chatReturning("pas du json") }),
    ).toBeNull();
  });

  it("désactive le « thinking » du modèle (garde-fou aligné sur le fix facture #177)", async () => {
    const client = chatReturning(
      JSON.stringify({ template_id: "compter_documents_par_type", annee: null }),
    );
    await selectAggregationTemplate("Combien de documents ?", { client });
    const spy = client.chatCompletion as ReturnType<typeof vi.fn>;
    expect(spy.mock.calls[0]?.[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
