import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfomaniakClient, InfomaniakError } from "./client";
import type { IkChatCompletionResponse, IkModelsResponse } from "./types";

// Hermétique : tests/setup.ts charge .env.local, qui contient désormais de vraies
// valeurs IK_*. On neutralise toute fuite avant chaque test pour que les assertions
// "config absente" / "catégorie non mappée" testent bien le code, pas l'environnement.
const IK_ENV_KEYS = [
  "IK_PRODUCT_ID",
  "IK_API_TOKEN",
  "IK_MODEL_CHAT_SMALL",
  "IK_MODEL_CHAT_LARGE",
  "IK_MODEL_VISION",
  "IK_MODEL_EMBEDDINGS",
  "IK_MODEL_RERANKER",
];

beforeEach(() => {
  for (const k of IK_ENV_KEYS) vi.stubEnv(k, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Construit une Response-like mockée minimale (suffisant pour le client).
function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }): Response {
  const status = init?.status ?? 200;
  return {
    ok: init?.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
  } as unknown as Response;
}

const TOKEN = "tok_test";
const PRODUCT = "12345";

function makeClient(fetchImpl: typeof fetch) {
  return new InfomaniakClient({ productId: PRODUCT, apiToken: TOKEN, fetchImpl });
}

const MODELS: IkModelsResponse = {
  object: "list",
  data: [{ id: "ministral-3-14b" }, { id: "qwen3.5-122b" }],
};

describe("InfomaniakClient — config", () => {
  it("lève config si IK_PRODUCT_ID absent", async () => {
    const client = new InfomaniakClient({ apiToken: TOKEN, fetchImpl: vi.fn() });
    await expect(client.listModels()).rejects.toMatchObject({ code: "config" });
  });

  it("lève config si IK_API_TOKEN absent", async () => {
    const client = new InfomaniakClient({ productId: PRODUCT, fetchImpl: vi.fn() });
    await expect(client.listModels()).rejects.toMatchObject({ code: "config" });
  });
});

describe("InfomaniakClient — listModels", () => {
  it("appelle GET /v1/models avec Bearer et parse data[]", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    const models = await makeClient(fetchImpl as unknown as typeof fetch).listModels();

    expect(models.map((m) => m.id)).toEqual(["ministral-3-14b", "qwen3.5-122b"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.infomaniak.com/2/ai/${PRODUCT}/openai/v1/models`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("met le catalogue en cache (un seul appel réseau sur 2 lectures)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await client.listModels();
    await client.listModels();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetch après clearModelsCache", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await client.listModels();
    client.clearModelsCache();
    await client.listModels();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("InfomaniakClient — resolveModel (mapping par catégorie, jamais codé en dur)", () => {
  it("résout via IK_MODEL_CHAT_SMALL quand l'id existe dans le catalogue", async () => {
    vi.stubEnv("IK_MODEL_CHAT_SMALL", "ministral-3-14b");
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    const id = await makeClient(fetchImpl as unknown as typeof fetch).resolveModel("chat_small");
    expect(id).toBe("ministral-3-14b");
  });

  it("lève config si la catégorie n'est pas mappée en env", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).resolveModel("chat_large"),
    ).rejects.toMatchObject({ code: "config" });
  });

  it("lève model_not_available si l'id configuré a disparu du catalogue (dérive Beta)", async () => {
    vi.stubEnv("IK_MODEL_VISION", "modele-fantome");
    const fetchImpl = vi.fn(async () => jsonResponse(MODELS));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).resolveModel("vision"),
    ).rejects.toMatchObject({ code: "model_not_available" });
  });
});

describe("InfomaniakClient — chatCompletion", () => {
  it("POST /v1/chat/completions avec le body attendu", async () => {
    const completion: IkChatCompletionResponse = {
      model: "ministral-3-14b",
      choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(completion));
    const res = await makeClient(fetchImpl as unknown as typeof fetch).chatCompletion({
      model: "ministral-3-14b",
      temperature: 0,
      messages: [{ role: "user", content: "ping" }],
    });

    expect(res.choices[0]?.message.content).toBe("OK");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.infomaniak.com/2/ai/${PRODUCT}/openai/v1/chat/completions`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "ministral-3-14b", temperature: 0 });
  });
});

describe("InfomaniakClient — mapping des erreurs HTTP", () => {
  it("401 → unauthorized (sans fuite de token)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 401 }));
    const err = await makeClient(fetchImpl as unknown as typeof fetch)
      .listModels()
      .catch((e) => e);
    expect(err).toBeInstanceOf(InfomaniakError);
    expect(err.code).toBe("unauthorized");
    expect(String(err.message)).not.toContain(TOKEN);
  });

  it("429 → rate_limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 429 }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).listModels(),
    ).rejects.toMatchObject({ code: "rate_limit" });
  });

  it("500 → api_error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 500 }));
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).listModels(),
    ).rejects.toMatchObject({ code: "api_error" });
  });

  it("AbortError réseau → timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    await expect(
      makeClient(fetchImpl as unknown as typeof fetch).listModels(),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
