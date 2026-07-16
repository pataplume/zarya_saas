import { describe, expect, it, vi } from "vitest";
import { detectIntent } from "./detect-intent";
import type { ChatModelClient } from "./infomaniak-classifier";

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

describe("detectIntent", () => {
  it("retourne l'intent fourni par le LLM (JSON valide)", async () => {
    const { intent } = await detectIntent("Combien de factures en 2026 ?", {
      client: chatReturning(JSON.stringify({ intent: "agregation" })),
    });
    expect(intent).toBe("agregation");
  });

  it("fallback 'recherche' si le LLM renvoie un intent inconnu", async () => {
    const { intent } = await detectIntent("?", {
      client: chatReturning(JSON.stringify({ intent: "n'importe quoi" })),
    });
    expect(intent).toBe("recherche");
  });

  it("fallback 'recherche' si le LLM échoue ou rend un JSON invalide", async () => {
    const failing: ChatModelClient = {
      resolveModel: async () => "m",
      chatCompletion: async () => {
        throw new Error("LLM down");
      },
    };
    expect((await detectIntent("x", { client: failing })).intent).toBe("recherche");

    const garbage = chatReturning("pas du json");
    expect((await detectIntent("x", { client: garbage })).intent).toBe("recherche");
  });

  it("désactive le « thinking » du modèle (garde-fou aligné sur le fix facture #177)", async () => {
    const client = chatReturning(JSON.stringify({ intent: "factuelle" }));
    await detectIntent("Question ?", { client });
    const spy = client.chatCompletion as ReturnType<typeof vi.fn>;
    expect(spy.mock.calls[0]?.[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
