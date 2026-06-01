// Wrapper Microsoft Graph scopé cabinet_id (Bloc D2).
// Réf : docs/architecture/microsoft-integration.md §3.1 (surface), §9 (résilience),
// packages/integrations/CLAUDE.md (pattern wrapper + audit §2).
//
// Garanties :
//  - TOUJOURS instancié avec un cabinet_id ; chaque appel injecte le bon token de CE
//    cabinet (via getValidMicrosoftAccessToken, refresh proactif transparent — D1).
//  - Tout appel est journalisé dans audit.api_externe (best-effort : un échec d'audit
//    ne casse pas l'opération métier, il est loggué).
//  - Throttling (429/503) : respect de Retry-After + backoff exponentiel, max 3 essais.
//  - Erreurs typées MicrosoftGraphError (401 → 'revoked' = reconnexion requise).
//
// Serveur uniquement (secrets + tokens) : jamais importé côté client navigateur.
//
// Hors-scope D2 (→ D5) : l'identité d'expéditeur cabinet + la signature sur sendEmail
// (ici envoi BRUT). Hors-scope D2 (→ D4) : les webhooks/subscriptions.

import { type ApiExterneAuditEntry, recordApiExterne } from "@zarya/db";
import { logger } from "@zarya/logger";
import { MicrosoftGraphError } from "./errors";
import type {
  CalendarEvent,
  CreateEventParams,
  EmailDetail,
  EmailFilter,
  EmailSummary,
  EventFilter,
  SendEmailParams,
} from "./graph-types";
import { getMicrosoftOAuthConfig } from "./oauth";
import type { TenantRegionSignal } from "./region";
import { getValidMicrosoftAccessToken } from "./token-store";
import type { MicrosoftOAuthConfig } from "./types";

const GRAPH_PROVIDER = "microsoft_graph" as const;
const DEFAULT_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

export interface MicrosoftGraphActeur {
  type: string; // 'systeme' (webhook/job), 'cabinet_membre' (action UI)…
  id?: string | null;
}

export interface MicrosoftGraphClientOptions {
  /** Config OAuth (défaut : lue depuis l'env serveur à la 1re utilisation). */
  config?: MicrosoftOAuthConfig;
  /** Implémentation fetch (injectable pour tests). */
  fetchImpl?: typeof fetch;
  /** Résolveur de token (défaut : getValidMicrosoftAccessToken, DB + refresh). */
  getAccessToken?: (cabinetId: string) => Promise<string>;
  /** Écriture d'audit (défaut : recordApiExterne → audit.api_externe). */
  recordAudit?: (entry: ApiExterneAuditEntry) => Promise<void>;
  /** Pause entre tentatives (injectable no-op pour tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Horloge (injectable pour tests). */
  now?: () => number;
  /** Acteur à l'origine de l'appel (défaut : système). */
  acteur?: MicrosoftGraphActeur;
  /** Tentatives max sur throttling/réseau (défaut 3). */
  maxAttempts?: number;
  /** Base URL Graph (défaut v1.0). */
  baseUrl?: string;
}

interface RequestInitOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  binary?: boolean;
  /** Endpoint normalisé (sans id ni PII) pour l'audit. */
  auditEndpoint: string;
}

// ─── Formes brutes Graph (internes) ───────────────────────────────────────────

interface GraphMessage {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string | null } | null } | null;
  body?: { contentType?: string | null; content?: string | null } | null;
  toRecipients?: Array<{ emailAddress?: { address?: string | null } | null }> | null;
}

interface GraphFileAttachment {
  contentBytes?: string;
}

interface GraphEvent {
  id: string;
  subject?: string | null;
  isAllDay?: boolean;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
}

interface GraphOrganization {
  countryLetterCode?: string | null;
  preferredDataLocation?: string | null;
}

export class MicrosoftGraphClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly acteur: MicrosoftGraphActeur;
  private readonly maxAttempts: number;
  private readonly baseUrl: string;
  private readonly recordAudit: (entry: ApiExterneAuditEntry) => Promise<void>;
  private readonly getAccessToken: (cabinetId: string) => Promise<string>;
  private cachedConfig: MicrosoftOAuthConfig | undefined;

  constructor(
    private readonly cabinet_id: string,
    private readonly opts: MicrosoftGraphClientOptions = {},
  ) {
    if (!cabinet_id) {
      throw new MicrosoftGraphError("not_connected", "MicrosoftGraphClient exige un cabinet_id.");
    }
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.acteur = opts.acteur ?? { type: "systeme", id: null };
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.recordAudit = opts.recordAudit ?? recordApiExterne;
    this.cachedConfig = opts.config;
    this.getAccessToken =
      opts.getAccessToken ?? ((id) => getValidMicrosoftAccessToken(id, this.resolveConfig()));
  }

  // ─── Email ───────────────────────────────────────────────────────────────

  async listEmails(filter: EmailFilter = {}): Promise<EmailSummary[]> {
    const folder = filter.folder ?? "Inbox";
    const select = filter.select ?? [
      "id",
      "subject",
      "from",
      "receivedDateTime",
      "hasAttachments",
      "bodyPreview",
    ];
    const filters: string[] = [];
    if (filter.unreadOnly) filters.push("isRead eq false");
    if (filter.since) filters.push(`receivedDateTime ge ${filter.since}`);

    const query: Record<string, string | number | boolean | undefined> = {
      $top: filter.top ?? 25,
      $select: select.join(","),
      $orderby: "receivedDateTime desc",
      $filter: filters.length > 0 ? filters.join(" and ") : undefined,
    };
    const res = await this.request<{ value: GraphMessage[] }>(
      "GET",
      `/me/mailFolders/${encodeURIComponent(folder)}/messages`,
      { query, auditEndpoint: "/me/mailFolders/{folder}/messages" },
    );
    return (res.value ?? []).map(toEmailSummary);
  }

  async getEmail(id: string): Promise<EmailDetail> {
    const msg = await this.request<GraphMessage>("GET", `/me/messages/${encodeURIComponent(id)}`, {
      auditEndpoint: "/me/messages/{id}",
    });
    return toEmailDetail(msg);
  }

  async downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const att = await this.request<GraphFileAttachment>(
      "GET",
      `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { auditEndpoint: "/me/messages/{id}/attachments/{id}" },
    );
    if (!att.contentBytes) {
      throw new MicrosoftGraphError(
        "api_error",
        "Pièce jointe sans contentBytes (type non-fichier ?).",
      );
    }
    return Buffer.from(att.contentBytes, "base64");
  }

  /**
   * Envoi BRUT (POST /me/sendMail). L'identité d'expéditeur cabinet + la signature
   * sont le périmètre de D5 — ici on envoie tel quel. Retourne void (202 Accepted).
   */
  async sendEmail(params: SendEmailParams): Promise<void> {
    const message = {
      subject: params.subject,
      body: { contentType: params.bodyType ?? "Text", content: params.body },
      toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
      ...(params.cc && params.cc.length > 0
        ? { ccRecipients: params.cc.map((address) => ({ emailAddress: { address } })) }
        : {}),
    };
    await this.request<undefined>("POST", "/me/sendMail", {
      body: { message, saveToSentItems: params.saveToSentItems ?? true },
      auditEndpoint: "/me/sendMail",
    });
  }

  // ─── Calendrier ────────────────────────────────────────────────────────────

  async listEvents(filter: EventFilter = {}): Promise<CalendarEvent[]> {
    const filters: string[] = [];
    if (filter.since) filters.push(`start/dateTime ge '${filter.since}'`);
    if (filter.until) filters.push(`end/dateTime le '${filter.until}'`);
    const query: Record<string, string | number | boolean | undefined> = {
      $top: filter.top ?? 25,
      $orderby: "start/dateTime",
      $filter: filters.length > 0 ? filters.join(" and ") : undefined,
    };
    const res = await this.request<{ value: GraphEvent[] }>("GET", "/me/events", {
      query,
      auditEndpoint: "/me/events",
    });
    return (res.value ?? []).map(toCalendarEvent);
  }

  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    const timeZone = params.timeZone ?? "UTC";
    const body = {
      subject: params.subject,
      start: { dateTime: params.start, timeZone },
      end: { dateTime: params.end, timeZone },
      isAllDay: params.isAllDay ?? false,
      ...(params.body ? { body: { contentType: "Text", content: params.body } } : {}),
      ...(params.attendees && params.attendees.length > 0
        ? {
            attendees: params.attendees.map((address) => ({
              emailAddress: { address },
              type: "required",
            })),
          }
        : {}),
    };
    const event = await this.request<GraphEvent>("POST", "/me/events", {
      body,
      auditEndpoint: "/me/events",
    });
    return toCalendarEvent(event);
  }

  // ─── Conformité (D3) ─────────────────────────────────────────────────────────

  /**
   * Lit le signal de région du tenant via GET /organization (Bloc D3). Sert à la
   * détection d'adéquation UE/Suisse. Champs non sensibles uniquement.
   */
  async getTenantRegionSignal(): Promise<TenantRegionSignal> {
    const res = await this.request<{ value: GraphOrganization[] }>("GET", "/organization", {
      query: { $select: "countryLetterCode,preferredDataLocation" },
      auditEndpoint: "/organization",
    });
    const org = res.value?.[0];
    return {
      countryLetterCode: org?.countryLetterCode ?? null,
      preferredDataLocation: org?.preferredDataLocation ?? null,
    };
  }

  // ─── Webhooks / subscriptions (D4) ───────────────────────────────────────────

  /** Crée une subscription Graph (POST /subscriptions). Microsoft valide l'URL de
   *  notification de façon synchrone (handshake validationToken) → l'endpoint doit être
   *  joignable publiquement. Retourne l'id + l'expiration. */
  async createSubscription(params: {
    changeType: string;
    notificationUrl: string;
    resource: string;
    expirationDateTime: string;
    clientState: string;
  }): Promise<{ id: string; expirationDateTime: string }> {
    const res = await this.request<{ id: string; expirationDateTime: string }>(
      "POST",
      "/subscriptions",
      { body: params, auditEndpoint: "/subscriptions" },
    );
    return { id: res.id, expirationDateTime: res.expirationDateTime };
  }

  // ─── Cœur transport (auth + audit + retry + throttling) ──────────────────────

  private resolveConfig(): MicrosoftOAuthConfig {
    if (!this.cachedConfig) this.cachedConfig = getMicrosoftOAuthConfig();
    return this.cachedConfig;
  }

  private async request<T>(method: string, path: string, init: RequestInitOptions): Promise<T> {
    const token = await this.getAccessToken(this.cabinet_id);
    const url = this.baseUrl + path + buildQueryString(init.query);

    let attempt = 0;
    while (true) {
      attempt++;
      const started = this.now();
      let res: Response | null = null;
      let networkErr: unknown = null;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        });
      } catch (err) {
        networkErr = err;
      }
      const latency = this.now() - started;

      // Échec réseau / timeout → retry si tentatives restantes.
      if (networkErr || !res) {
        await this.audit(init.auditEndpoint, method, null, false, "api_error", latency, {
          attempt,
        });
        if (attempt < this.maxAttempts) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw new MicrosoftGraphError("api_error", "Erreur réseau Microsoft Graph.", networkErr);
      }

      const status = res.status;

      // Throttling Microsoft (§9.3) : respect de Retry-After + backoff.
      if (status === 429 || status === 503) {
        const retryAfterMs = parseRetryAfter(res.headers) ?? this.backoff(attempt);
        await this.audit(init.auditEndpoint, method, status, false, "throttled", latency, {
          attempt,
          retry_after_ms: retryAfterMs,
        });
        if (attempt < this.maxAttempts) {
          await this.sleep(retryAfterMs);
          continue;
        }
        throw new MicrosoftGraphError(
          "api_error",
          `Microsoft Graph throttling persistant (${status}).`,
        );
      }

      // 401 → token révoqué/insuffisant : reconnexion requise (§9.2). Pas de retry.
      if (status === 401) {
        await this.audit(init.auditEndpoint, method, 401, false, "revoked", latency, { attempt });
        throw new MicrosoftGraphError(
          "revoked",
          "Accès Microsoft refusé (401) — reconnexion requise.",
        );
      }

      if (status < 200 || status >= 300) {
        const graphCode = await readGraphErrorCode(res);
        await this.audit(init.auditEndpoint, method, status, false, "api_error", latency, {
          attempt,
          ...(graphCode ? { graph_code: graphCode } : {}),
        });
        throw new MicrosoftGraphError(
          "api_error",
          `Microsoft Graph a retourné ${status}${graphCode ? ` (${graphCode})` : ""}.`,
        );
      }

      // Succès.
      await this.audit(init.auditEndpoint, method, status, true, null, latency, { attempt });
      if (init.binary) return Buffer.from(await res.arrayBuffer()) as unknown as T;
      if (status === 204 || status === 202) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  private backoff(attempt: number): number {
    return BACKOFF_BASE_MS * 2 ** (attempt - 1);
  }

  private async audit(
    endpoint: string,
    method: string,
    statusCode: number | null,
    ok: boolean,
    errorCode: string | null,
    latencyMs: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.recordAudit({
        cabinet_id: this.cabinet_id,
        provider: GRAPH_PROVIDER,
        endpoint,
        method,
        status_code: statusCode,
        ok,
        error_code: errorCode,
        latency_ms: latencyMs,
        acteur_type: this.acteur.type,
        acteur_id: this.acteur.id ?? null,
        metadata,
      });
    } catch (err) {
      // Best-effort : un échec d'audit ne doit pas casser l'opération métier.
      logger.warn(
        {
          cabinet_id: this.cabinet_id,
          provider: GRAPH_PROVIDER,
          endpoint,
          error: errToContext(err),
        },
        "[microsoft.graph] écriture audit.api_externe échouée",
      );
    }
  }
}

// ─── Helpers purs ─────────────────────────────────────────────────────────────

function buildQueryString(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Parse l'en-tête Retry-After (secondes entières) en ms, ou null si absent/invalide. */
function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

async function readGraphErrorCode(res: Response): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { error?: { code?: string } };
    return data?.error?.code;
  } catch {
    return undefined;
  }
}

function errToContext(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function toEmailSummary(m: GraphMessage): EmailSummary {
  return {
    id: m.id,
    subject: m.subject ?? null,
    from: m.from?.emailAddress?.address ?? null,
    receivedDateTime: m.receivedDateTime ?? null,
    hasAttachments: m.hasAttachments ?? false,
    bodyPreview: m.bodyPreview ?? null,
  };
}

function toEmailDetail(m: GraphMessage): EmailDetail {
  return {
    ...toEmailSummary(m),
    bodyContentType: m.body?.contentType ?? null,
    body: m.body?.content ?? null,
    toRecipients: (m.toRecipients ?? [])
      .map((r) => r.emailAddress?.address)
      .filter((a): a is string => typeof a === "string"),
  };
}

function toCalendarEvent(e: GraphEvent): CalendarEvent {
  return {
    id: e.id,
    subject: e.subject ?? null,
    start: e.start?.dateTime ?? null,
    end: e.end?.dateTime ?? null,
    isAllDay: e.isAllDay ?? false,
  };
}
