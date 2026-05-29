import { InfomaniakError } from "@zarya/integrations";
import { describe, expect, it, vi } from "vitest";
import { ExtractionError } from "./classifier";
import { type ChatModelClient, InfomaniakClassifier } from "./infomaniak-classifier";

const MODEL = "mistralai/Ministral-3-14B-Instruct-2512";

function chatResponse(
  contentObj: unknown,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
) {
  return {
    model: MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: JSON.stringify(contentObj) },
        finish_reason: "stop",
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

const VALID_RAW = {
  type: "releve_bancaire",
  categorie: "bancaire",
  libelle: "Relevé UBS",
  periode: "2026-04",
  confiance_globale: 0.9,
  confiance_type: 0.9,
  confiance_categorie: 0.95,
  confiance_periode: 0.8,
  anomalies: [],
};

const INPUT = { nom_fichier: "releve_ubs_2026-04.pdf", ocr_text: "Relevé de compte UBS" };

// Construit un faux client. `chat` reçoit (params) et renvoie une réponse ou throw.
function makeClient(
  chat: ChatModelClient["chatCompletion"],
  resolve: ChatModelClient["resolveModel"] = async () => MODEL,
): ChatModelClient {
  return { resolveModel: resolve, chatCompletion: chat };
}

describe("InfomaniakClassifier — chemin json_schema (vérifié)", () => {
  it("classe via json_schema et mappe la proposition + usage tokens", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () =>
      chatResponse(VALID_RAW, {
        prompt_tokens: 120,
        completion_tokens: 40,
        total_tokens: 160,
      }),
    );
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);

    expect(res.proposal.type).toBe("releve_bancaire");
    expect(res.proposal.categorie).toBe("bancaire");
    expect(res.proposal.periode).toBe("2026-04");
    expect(res.proposal.confiance_par_champ.categorie).toBe(0.95);
    expect(res.model_used).toBe(MODEL);
    expect(res.prompt_version).toBe("ik-classify-v2");
    expect(res.usage).toEqual({ tokens_input: 120, tokens_output: 40 });

    // 1 seul appel, et il portait bien response_format json_schema.
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0]?.[0].response_format?.type).toBe("json_schema");
  });

  it("dérive la catégorie du type connu, même si le modèle propose autre chose", async () => {
    // Le modèle renvoie un type connu (releve_bancaire) mais une catégorie erronée.
    // La catégorie est une fonction du type → on corrige côté code (invariant taxonomie).
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () =>
      chatResponse({ ...VALID_RAW, categorie: "fiscal" }),
    );
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.categorie).toBe("bancaire");
  });

  it("type inconnu + catégorie invalide → autre", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () =>
      chatResponse({ ...VALID_RAW, type: "type_inexistant", categorie: "banque" }),
    );
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.categorie).toBe("autre");
  });

  it("clampe les confiances hors bornes dans [0,1]", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () =>
      chatResponse({ ...VALID_RAW, confiance_globale: 1.5, confiance_type: -0.2 }),
    );
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.confiance_globale).toBe(1);
    expect(res.proposal.confiance_par_champ.type).toBe(0);
  });
});

describe("InfomaniakClassifier — fallback (parité Beta non garantie)", () => {
  it("si json_schema est refusé (api_error), retente sans response_format", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async (params) => {
      if (params.response_format) {
        throw new InfomaniakError("api_error", "json_schema refusé");
      }
      return chatResponse(VALID_RAW);
    });
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.type).toBe("releve_bancaire");
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0].response_format).toBeUndefined();
  });

  it("si la 1re réponse est un JSON invalide, retente et réussit", async () => {
    let call = 0;
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () => {
      call += 1;
      if (call === 1) {
        return {
          model: MODEL,
          choices: [
            {
              index: 0,
              message: { role: "assistant" as const, content: "désolé, pas de JSON ici" },
              finish_reason: "stop",
            },
          ],
        };
      }
      return chatResponse(VALID_RAW);
    });
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.type).toBe("releve_bancaire");
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("parse même un JSON entouré de texte / fences markdown", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () => ({
      model: MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: `Voici:\n\`\`\`json\n${JSON.stringify(VALID_RAW)}\n\`\`\``,
          },
          finish_reason: "stop",
        },
      ],
    }));
    const res = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT);
    expect(res.proposal.type).toBe("releve_bancaire");
  });

  it("si les deux tentatives échouent → ExtractionError VALIDATION_FAILED", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () => ({
      model: MODEL,
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: "rien d'exploitable" },
          finish_reason: "stop",
        },
      ],
    }));
    const err = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.code).toBe("VALIDATION_FAILED");
  });
});

describe("InfomaniakClassifier — erreurs non récupérables (pas de fallback)", () => {
  it("rate_limit → ExtractionError RATE_LIMIT, sans 2e appel", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () => {
      throw new InfomaniakError("rate_limit", "429");
    });
    const err = await new InfomaniakClassifier(makeClient(chat)).classify(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.code).toBe("RATE_LIMIT");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("resolveModel échoue (config) → ExtractionError CONFIG", async () => {
    const chat = vi.fn<ChatModelClient["chatCompletion"]>(async () => chatResponse(VALID_RAW));
    const resolve = vi.fn<ChatModelClient["resolveModel"]>(async () => {
      throw new InfomaniakError("config", "IK_MODEL_CHAT_SMALL absent");
    });
    const err = await new InfomaniakClassifier(makeClient(chat, resolve))
      .classify(INPUT)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.code).toBe("CONFIG");
    expect(chat).not.toHaveBeenCalled();
  });
});
