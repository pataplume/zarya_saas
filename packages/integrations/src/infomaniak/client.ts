import type {
  IkChatCompletionParams,
  IkChatCompletionResponse,
  IkEmbeddingsParams,
  IkEmbeddingsResponse,
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

// Retry/backoff (llm-strategy.md § 9.1) : 429 → jitter, 5xx → backoff exponentiel,
// réseau transitoire → retry. Jamais sur 401/403, timeout, 4xx validation, config.
const DEFAULT_MAX_RETRIES = 3; // soit jusqu'à 4 tentatives au total
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;
const RETRY_AFTER_CAP_MS = 30_000; // borne le Retry-After serveur (anti-attente absurde)

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

// Parse l'en-tête Retry-After (forme "secondes" uniquement ; la forme HTTP-date
// est ignorée → on retombe sur le backoff). Renvoie des ms, ou undefined.
function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const secs = Number(header.trim());
  if (!Number.isFinite(secs) || secs < 0) return undefined;
  return secs * 1000;
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
  /** L'erreur est-elle réessayable (429, 5xx, réseau transitoire) ? */
  public readonly retryable: boolean;
  /** Délai d'attente conseillé par le serveur (Retry-After, en ms), si fourni. */
  public readonly retryAfterMs: number | undefined;

  constructor(
    public readonly code: InfomaniakErrorCode,
    message: string,
    // `originalCause` pour éviter le conflit avec Error.cause (ES2022+)
    public readonly originalCause?: unknown,
    opts?: { retryable?: boolean; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "InfomaniakError";
    this.retryable = opts?.retryable ?? false;
    this.retryAfterMs = opts?.retryAfterMs;
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
  /** Nombre max de retries sur erreur réessayable (défaut 3). 0 = aucun retry. */
  maxRetries?: number;
  /** Délai de base du backoff exponentiel, en ms (défaut 500). */
  baseDelayMs?: number;
  /** Plafond d'un délai de backoff, en ms (défaut 8000). */
  maxDelayMs?: number;
  /** Attente injectable (tests : aucune attente réelle). */
  sleepImpl?: (ms: number) => Promise<void>;
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
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private modelsCache: ModelsCache | null = null;

  constructor(opts: InfomaniakClientOptions = {}) {
    this.productId = opts.productId ?? env("IK_PRODUCT_ID");
    this.apiToken = opts.apiToken ?? env("IK_API_TOKEN");
    this.baseUrlOverride = opts.baseUrl;
    this.cacheTtlMs = opts.modelsCacheTtlMs ?? MODELS_CACHE_TTL_MS;
    // Bind pour préserver le contexte si on prend le fetch global.
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.sleepImpl = opts.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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

  /**
   * Exécute la requête avec retry/backoff sur erreur réessayable (llm-strategy.md
   * § 9.1) : 429 (jitter, Retry-After honoré), 5xx (backoff exponentiel), réseau
   * transitoire. Les erreurs non réessayables (401/403, timeout, 4xx validation,
   * config, parse) remontent immédiatement.
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.attemptOnce<T>(path, init);
      } catch (err) {
        const retryable = err instanceof InfomaniakError && err.retryable;
        if (!retryable || attempt >= this.maxRetries) throw err;
        await this.sleepImpl(this.backoffDelayMs(attempt, err));
        attempt += 1;
      }
    }
  }

  /** Une tentative réseau unique (timeout propre par tentative). */
  private async attemptOnce<T>(path: string, init?: RequestInit): Promise<T> {
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
        // Timeout : pas de retry (30s × tentatives serait trop coûteux).
        throw new InfomaniakError("timeout", `Infomaniak n'a pas répondu en ${TIMEOUT_MS}ms.`);
      }
      // Réseau transitoire (ECONNRESET, DNS, etc.) → réessayable.
      throw new InfomaniakError("api_error", "Erreur réseau lors de l'appel Infomaniak.", err, {
        retryable: true,
      });
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
      const retryAfterMs = parseRetryAfterMs(response.headers?.get?.("retry-after"));
      throw new InfomaniakError("rate_limit", "Quota Infomaniak atteint (HTTP 429).", undefined, {
        retryable: true,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }
    if (!response.ok) {
      // 5xx → transitoire (réessayable) ; autres 4xx → erreur applicative (non).
      throw new InfomaniakError(
        "api_error",
        `Infomaniak a retourné HTTP ${response.status}.`,
        undefined,
        { retryable: response.status >= 500 },
      );
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new InfomaniakError("parse_error", "Réponse Infomaniak non parseable (JSON).", err);
    }
  }

  /**
   * Délai avant la prochaine tentative. 429 avec Retry-After : on respecte le
   * serveur (cappé). Sinon backoff exponentiel base·2^n (cappé) + full jitter.
   */
  private backoffDelayMs(attempt: number, err: InfomaniakError): number {
    if (err.retryAfterMs !== undefined) {
      return Math.min(err.retryAfterMs, RETRY_AFTER_CAP_MS);
    }
    const ceiling = Math.min(this.baseDelayMs * 2 ** attempt, this.maxDelayMs);
    return Math.random() * ceiling; // full jitter (AWS "Exponential Backoff And Jitter")
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

  /** POST /v1/embeddings — vectorise un texte ou un lot (batch). */
  async embeddings(params: IkEmbeddingsParams): Promise<IkEmbeddingsResponse> {
    return this.request<IkEmbeddingsResponse>("/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  }
}

// Singleton plateforme (credentials ZARYA, pas par cabinet — comme Zefix).
export const infomaniakClient = new InfomaniakClient();
