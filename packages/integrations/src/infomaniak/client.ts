import type {
  IkChatCompletionParams,
  IkChatCompletionResponse,
  IkModel,
  IkModelsResponse,
  ModelCategory,
} from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────
//
// Secrets serveur UNIQUEMENT (CLAUDE.md règle #7). Jamais exposés côté client,
// jamais loggués (le token n'est écrit nulle part dans ce module).
//
//   IK_PRODUCT_ID  identifiant numérique du produit "AI Tools" Infomaniak
//   IK_API_TOKEN   token Bearer (scope ai)
//
// Mapping catégorie → id réel, lui aussi en config (PAS de model_id codé en dur,
// cf. ADR 0010). Les ids sont remplis APRÈS lecture de GET /v1/models :
//   IK_MODEL_CHAT_SMALL, IK_MODEL_CHAT_LARGE, IK_MODEL_VISION,
//   IK_MODEL_EMBEDDINGS, IK_MODEL_RERANKER

const TIMEOUT_MS = 30_000; // l'inférence LLM peut être lente (Beta)
const MODELS_CACHE_TTL_MS = 5 * 60_000; // 5 min : absorbe la dérive du catalogue Beta

const CATEGORY_ENV_VAR: Record<ModelCategory, string> = {
  chat_small: "IK_MODEL_CHAT_SMALL",
  chat_large: "IK_MODEL_CHAT_LARGE",
  vision: "IK_MODEL_VISION",
  embeddings: "IK_MODEL_EMBEDDINGS",
  reranker: "IK_MODEL_RERANKER",
};

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

// ─── Erreur typée ─────────────────────────────────────────────────────────────

export type InfomaniakErrorCode =
  | "config" // env manquante (product id / token / mapping catégorie)
  | "timeout"
  | "rate_limit"
  | "unauthorized" // 401/403 → credentials cassés (alerte ops, cf. CLAUDE.md)
  | "model_not_available" // id configuré absent du catalogue live (dérive Beta)
  | "api_error"
  | "parse_error";

export class InfomaniakError extends Error {
  constructor(
    public readonly code: InfomaniakErrorCode,
    message: string,
    // `originalCause` pour éviter le conflit avec Error.cause (ES2022+)
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = "InfomaniakError";
  }
}

// ─── Options client (injectables pour les tests) ──────────────────────────────

export interface InfomaniakClientOptions {
  productId?: string;
  apiToken?: string;
  /** Override complet de la base URL (tests). Sinon construite depuis productId. */
  baseUrl?: string;
  /** TTL du cache /v1/models en ms. */
  modelsCacheTtlMs?: number;
  /** Permet d'injecter un fetch mocké en test. */
  fetchImpl?: typeof fetch;
}

interface ModelsCache {
  fetchedAt: number;
  models: IkModel[];
}

export class InfomaniakClient {
  private readonly productId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly baseUrlOverride: string | undefined;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private modelsCache: ModelsCache | null = null;

  constructor(opts: InfomaniakClientOptions = {}) {
    this.productId = opts.productId ?? env("IK_PRODUCT_ID");
    this.apiToken = opts.apiToken ?? env("IK_API_TOKEN");
    this.baseUrlOverride = opts.baseUrl;
    this.cacheTtlMs = opts.modelsCacheTtlMs ?? MODELS_CACHE_TTL_MS;
    // Bind pour préserver le contexte si on prend le fetch global.
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private baseUrl(): string {
    if (this.baseUrlOverride) return this.baseUrlOverride.replace(/\/$/, "");
    if (!this.productId) {
      throw new InfomaniakError("config", "IK_PRODUCT_ID absent (env serveur requise).");
    }
    return `https://api.infomaniak.com/2/ai/${this.productId}/openai/v1`;
  }

  private authHeader(): string {
    if (!this.apiToken) {
      throw new InfomaniakError("config", "IK_API_TOKEN absent (env serveur requise).");
    }
    return `Bearer ${this.apiToken}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl()}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: this.authHeader(),
          ...(init?.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof InfomaniakError) throw err; // config (authHeader)
      if (err instanceof Error && err.name === "AbortError") {
        throw new InfomaniakError("timeout", `Infomaniak n'a pas répondu en ${TIMEOUT_MS}ms.`);
      }
      throw new InfomaniakError("api_error", "Erreur réseau lors de l'appel Infomaniak.", err);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      // Ne jamais inclure le token dans le message (CLAUDE.md règle #2/#7).
      throw new InfomaniakError(
        "unauthorized",
        `Infomaniak a refusé l'authentification (HTTP ${response.status}). Credentials à vérifier.`,
      );
    }
    if (response.status === 429) {
      throw new InfomaniakError("rate_limit", "Quota Infomaniak atteint (HTTP 429).");
    }
    if (!response.ok) {
      throw new InfomaniakError("api_error", `Infomaniak a retourné HTTP ${response.status}.`);
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new InfomaniakError("parse_error", "Réponse Infomaniak non parseable (JSON).", err);
    }
  }

  /**
   * GET /v1/models — catalogue live (ids réels). Résultat mis en cache (TTL court)
   * pour limiter les appels tout en absorbant la dérive du catalogue Beta.
   */
  async listModels(opts?: { forceRefresh?: boolean }): Promise<IkModel[]> {
    const now = Date.now();
    if (
      !opts?.forceRefresh &&
      this.modelsCache &&
      now - this.modelsCache.fetchedAt < this.cacheTtlMs
    ) {
      return this.modelsCache.models;
    }
    const body = await this.request<IkModelsResponse>("/models");
    const models = Array.isArray(body?.data) ? body.data : [];
    this.modelsCache = { fetchedAt: now, models };
    return models;
  }

  /** Vide le cache /v1/models (tests, ou rotation forcée). */
  clearModelsCache(): void {
    this.modelsCache = null;
  }

  /**
   * Résout l'id réel pour une catégorie logique :
   *  1. lit l'id configuré dans IK_MODEL_<CATEGORY> (jamais codé en dur) ;
   *  2. vérifie qu'il est bien servi par le catalogue live (sinon fail loud).
   * C'est ce double contrôle qui protège la prod contre la dérive du catalogue Beta.
   */
  async resolveModel(category: ModelCategory): Promise<string> {
    const envVar = CATEGORY_ENV_VAR[category];
    const configured = env(envVar);
    if (!configured) {
      throw new InfomaniakError(
        "config",
        `${envVar} absent : aucun modèle configuré pour la catégorie "${category}".`,
      );
    }
    const models = await this.listModels();
    const exists = models.some((m) => m.id === configured);
    if (!exists) {
      const available = models.map((m) => m.id).join(", ") || "(catalogue vide)";
      throw new InfomaniakError(
        "model_not_available",
        `Modèle "${configured}" (${envVar}) absent du catalogue live. Disponibles : ${available}.`,
      );
    }
    return configured;
  }

  /** POST /v1/chat/completions. */
  async chatCompletion(params: IkChatCompletionParams): Promise<IkChatCompletionResponse> {
    return this.request<IkChatCompletionResponse>("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  }
}

// Singleton plateforme (credentials ZARYA, pas par cabinet — comme Zefix).
export const infomaniakClient = new InfomaniakClient();
