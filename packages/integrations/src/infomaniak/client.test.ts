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
function jsonResponse(
  body: unknown,
  init?: { status?: number; ok?: boolean; headers?: Record<string, string> },
): Response {
  const status = init?.status ?? 200;
  const headers = init?.headers ?? {};
  return {
    ok: init?.ok ?? (status >= 200 && status < 300),
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const TOKEN = "tok_test";
const PRODUCT = "12345";

// maxRetries:0 → ces tests valident le mapping d'erreur, pas le retry (couvert plus bas).
function makeClient(fetchImpl: typeof fetch) {
  return new InfomaniakClient({ productId: PRODUCT, apiToken: TOKEN, fetchImpl, maxRetries: 0 });
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

describe("InfomaniakClient — embeddings", () => {
  it("POST /v1/embeddings avec input batch + retourne les vecteurs", async () => {
    const payload = {
      model: "bge_multilingual_gemma2",
      data: [
        { index: 0, embedding: [0.1, 0.2, 0.3] },
        { index: 1, embedding: [0.4, 0.5, 0.6] },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 0, total_tokens: 8 },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const res = await makeClient(fetchImpl as unknown as typeof fetch).embeddings({
      model: "bge_multilingual_gemma2",
      input: ["page 1", "page 2"],
    });

    expect(res.data).toHaveLength(2);
    expect(res.data[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.infomaniak.com/2/ai/${PRODUCT}/openai/v1/embeddings`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "bge_multilingual_gemma2", input: ["page 1", "page 2"] });
  });

  it("propage une erreur 429 (rate_limit, réessayable)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 429 }));
    const err = await makeClient(fetchImpl as unknown as typeof fetch)
      .embeddings({ model: "bge_multilingual_gemma2", input: "x" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(InfomaniakError);
    expect(err.code).toBe("rate_limit");
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

describe("InfomaniakClient — retry/backoff (llm-strategy.md § 9.1)", () => {
  // Client avec attente injectée (aucun sleep réel) + backoff déterministe court.
  function retryingClient(fetchImpl: typeof fetch, sleeps: number[], maxRetries = 3) {
    return new InfomaniakClient({
      productId: PRODUCT,
      apiToken: TOKEN,
      fetchImpl,
      maxRetries,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
  }

  it("429 puis 200 → réussit après 1 retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(MODELS));
    const sleeps: number[] = [];
    const models = await retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels();

    expect(models.map((m) => m.id)).toEqual(["ministral-3-14b", "qwen3.5-122b"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toHaveLength(1);
  });

  it("429 persistant → lève rate_limit après maxRetries+1 tentatives", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 429 }));
    const sleeps: number[] = [];
    await expect(
      retryingClient(fetchImpl as unknown as typeof fetch, sleeps, 3).listModels(),
    ).rejects.toMatchObject({ code: "rate_limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(sleeps).toHaveLength(3);
  });

  it("honore Retry-After (secondes) sur 429, sans jitter", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(jsonResponse(MODELS));
    const sleeps: number[] = [];
    await retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels();
    expect(sleeps).toEqual([2000]);
  });

  it("5xx → retenté puis réussit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(MODELS));
    const sleeps: number[] = [];
    const models = await retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels();
    expect(models).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("400 (validation) → pas de retry", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 400 }));
    const sleeps: number[] = [];
    await expect(
      retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels(),
    ).rejects.toMatchObject({ code: "api_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toHaveLength(0);
  });

  it("401 → pas de retry", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 401 }));
    const sleeps: number[] = [];
    await expect(
      retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels(),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("erreur réseau transitoire → retenté", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(MODELS));
    const sleeps: number[] = [];
    const models = await retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels();
    expect(models).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("timeout (AbortError) → pas de retry", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const sleeps: number[] = [];
    await expect(
      retryingClient(fetchImpl as unknown as typeof fetch, sleeps).listModels(),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("backoff exponentiel borné par maxDelayMs (full jitter)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 429 }));
    const sleeps: number[] = [];
    await retryingClient(fetchImpl as unknown as typeof fetch, sleeps, 3)
      .listModels()
      .catch(() => {});
    expect(sleeps).toHaveLength(3);
    for (const ms of sleeps) {
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(100); // maxDelayMs
    }
  });
});
