import type { ApiExterneAuditEntry } from "@zarya/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MicrosoftGraphClient } from "./client";
import { MicrosoftGraphError } from "./errors";

// ─── Outils de mock ────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const init: ResponseInit = {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  };
  return new Response(body === undefined ? "" : JSON.stringify(body), init);
}

type FetchReturn = Response | Error;

function queuedFetch(returns: FetchReturn[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = returns.shift();
    if (!next) throw new Error("queuedFetch: plus de réponses en file");
    if (next instanceof Error) throw next;
    return next;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function makeClient(impl: typeof fetch, overrides: Record<string, unknown> = {}) {
  const audits: ApiExterneAuditEntry[] = [];
  let clock = 1000;
  const client = new MicrosoftGraphClient("cab-A", {
    fetchImpl: impl,
    getAccessToken: async () => "access-token-xyz",
    recordAudit: async (e) => {
      audits.push(e);
    },
    sleep: async () => {},
    now: () => {
      clock += 5;
      return clock;
    },
    ...overrides,
  });
  return { client, audits };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Chemin nominal ─────────────────────────────────────────────────────────────

describe("MicrosoftGraphClient — chemin nominal", () => {
  it("listEmails : injecte le bearer, construit l'URL/query, mappe les résumés, audite ok", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({
        value: [
          {
            id: "m1",
            subject: "Facture mars",
            from: { emailAddress: { address: "client@pme.ch" } },
            receivedDateTime: "2026-03-01T10:00:00Z",
            hasAttachments: true,
            bodyPreview: "Bonjour",
          },
        ],
      }),
    ]);
    const { client, audits } = makeClient(impl);

    const emails = await client.listEmails({ unreadOnly: true, since: "2026-03-01T00:00:00Z" });

    expect(emails).toEqual([
      {
        id: "m1",
        subject: "Facture mars",
        from: "client@pme.ch",
        receivedDateTime: "2026-03-01T10:00:00Z",
        hasAttachments: true,
        bodyPreview: "Bonjour",
      },
    ]);
    const call = calls[0];
    expect(call?.url).toContain("/me/mailFolders/Inbox/messages");
    expect(call?.url).toContain("%24top=25");
    expect(call?.url).toContain("isRead+eq+false");
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-token-xyz");
    // Audit ok, scopé cabinet + provider + endpoint normalisé (sans id).
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      cabinet_id: "cab-A",
      provider: "microsoft_graph",
      endpoint: "/me/mailFolders/{folder}/messages",
      method: "GET",
      status_code: 200,
      ok: true,
      acteur_type: "systeme",
    });
  });

  it("getEmail : mappe le détail (corps + destinataires)", async () => {
    const { impl } = queuedFetch([
      jsonResponse({
        id: "m1",
        subject: "Sujet",
        from: { emailAddress: { address: "a@b.ch" } },
        body: { contentType: "html", content: "<p>hi</p>" },
        toRecipients: [{ emailAddress: { address: "dest@x.ch" } }],
      }),
    ]);
    const { client } = makeClient(impl);
    const mail = await client.getEmail("m1");
    expect(mail.body).toBe("<p>hi</p>");
    expect(mail.bodyContentType).toBe("html");
    expect(mail.toRecipients).toEqual(["dest@x.ch"]);
  });

  it("downloadAttachment : décode contentBytes base64 en Buffer", async () => {
    const payload = Buffer.from("PDF-CONTENT").toString("base64");
    const { impl } = queuedFetch([jsonResponse({ contentBytes: payload })]);
    const { client } = makeClient(impl);
    const buf = await client.downloadAttachment("m1", "att1");
    expect(buf.toString("utf8")).toBe("PDF-CONTENT");
  });

  it("sendEmail : POST /me/sendMail avec le message, retourne void sur 202", async () => {
    const { impl, calls } = queuedFetch([new Response("", { status: 202 })]);
    const { client, audits } = makeClient(impl);
    await expect(
      client.sendEmail({ subject: "S", body: "B", to: ["x@y.ch"] }),
    ).resolves.toBeUndefined();
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent.message.subject).toBe("S");
    expect(sent.message.toRecipients[0].emailAddress.address).toBe("x@y.ch");
    expect(sent.saveToSentItems).toBe(true);
    expect(audits[0]).toMatchObject({ endpoint: "/me/sendMail", method: "POST", ok: true });
  });

  it("createSubscription : POST /subscriptions, retourne id + expiration (D4b)", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({ id: "graph-sub-1", expirationDateTime: "2026-06-04T10:00:00Z" }),
    ]);
    const { client, audits } = makeClient(impl);
    const res = await client.createSubscription({
      changeType: "created",
      notificationUrl: "https://app.zarya.test/api/integrations/microsoft/webhook",
      resource: "/me/mailFolders('Inbox')/messages",
      expirationDateTime: "2026-06-04T10:00:00Z",
      clientState: "SECRET",
    });
    expect(res).toEqual({ id: "graph-sub-1", expirationDateTime: "2026-06-04T10:00:00Z" });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent.clientState).toBe("SECRET");
    expect(sent.resource).toBe("/me/mailFolders('Inbox')/messages");
    expect(audits[0]).toMatchObject({ endpoint: "/subscriptions", method: "POST", ok: true });
  });

  it("renewSubscription : PATCH /subscriptions/{id}, retourne la nouvelle expiration (D4c)", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({ id: "graph-sub-1", expirationDateTime: "2026-06-07T10:00:00Z" }),
    ]);
    const { client, audits } = makeClient(impl);
    const res = await client.renewSubscription("graph-sub-1", "2026-06-07T10:00:00Z");
    expect(res.expirationDateTime).toBe("2026-06-07T10:00:00Z");
    expect(calls[0]?.url).toContain("/subscriptions/graph-sub-1");
    expect(JSON.parse(String(calls[0]?.init?.body)).expirationDateTime).toBe(
      "2026-06-07T10:00:00Z",
    );
    expect(audits[0]).toMatchObject({ endpoint: "/subscriptions/{id}", method: "PATCH", ok: true });
  });

  it("getTenantRegionSignal : GET /organization, extrait country + dataLocation (D3)", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({
        value: [
          { countryLetterCode: "CH", preferredDataLocation: "CHE", displayName: "Cabinet X" },
        ],
      }),
    ]);
    const { client, audits } = makeClient(impl);
    const signal = await client.getTenantRegionSignal();
    expect(signal).toEqual({ countryLetterCode: "CH", preferredDataLocation: "CHE" });
    expect(calls[0]?.url).toContain("/organization");
    expect(audits[0]).toMatchObject({ endpoint: "/organization", method: "GET", ok: true });
  });

  it("createEvent : POST /me/events et mappe l'événement créé", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({
        id: "e1",
        subject: "Échéance TVA",
        start: { dateTime: "2026-04-30T08:00:00" },
        end: { dateTime: "2026-04-30T09:00:00" },
        isAllDay: false,
      }),
    ]);
    const { client } = makeClient(impl);
    const ev = await client.createEvent({
      subject: "Échéance TVA",
      start: "2026-04-30T08:00:00",
      end: "2026-04-30T09:00:00",
    });
    expect(ev.id).toBe("e1");
    expect(ev.start).toBe("2026-04-30T08:00:00");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.start.timeZone).toBe("UTC");
  });
});

// ─── Résilience : throttling / réseau / erreurs ─────────────────────────────────

describe("MicrosoftGraphClient — résilience", () => {
  it("429 avec Retry-After : retente puis réussit ; audit throttled + ok", async () => {
    const { impl } = queuedFetch([
      jsonResponse({ error: { code: "TooManyRequests" } }, 429, { "Retry-After": "0" }),
      jsonResponse({ value: [] }),
    ]);
    const { client, audits } = makeClient(impl);
    const res = await client.listEmails();
    expect(res).toEqual([]);
    expect(audits.map((a) => a.error_code)).toEqual(["throttled", null]);
    expect(audits[0]?.metadata).toMatchObject({ attempt: 1, retry_after_ms: 0 });
  });

  it("échec réseau : retente jusqu'au max puis lève api_error", async () => {
    const { impl } = queuedFetch([
      new TypeError("network down"),
      new TypeError("network down"),
      new TypeError("network down"),
    ]);
    const { client, audits } = makeClient(impl);
    await expect(client.listEmails()).rejects.toMatchObject({ code: "api_error" });
    // 3 tentatives → 3 lignes d'audit en échec.
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.ok === false && a.status_code === null)).toBe(true);
  });

  it("401 : lève 'revoked' sans retry (reconnexion requise)", async () => {
    const { impl, calls } = queuedFetch([
      jsonResponse({ error: { code: "InvalidAuthenticationToken" } }, 401),
    ]);
    const { client, audits } = makeClient(impl);
    await expect(client.getEmail("m1")).rejects.toMatchObject({
      name: "MicrosoftGraphError",
      code: "revoked",
    });
    expect(calls).toHaveLength(1); // pas de retry sur 401
    expect(audits[0]).toMatchObject({ status_code: 401, ok: false, error_code: "revoked" });
  });

  it("5xx non transitoire : lève api_error avec le code Graph", async () => {
    const { impl } = queuedFetch([jsonResponse({ error: { code: "InternalError" } }, 500)]);
    const { client, audits } = makeClient(impl);
    await expect(client.listEvents()).rejects.toMatchObject({ code: "api_error" });
    expect(audits[0]).toMatchObject({ status_code: 500, error_code: "api_error" });
    expect(audits[0]?.metadata).toMatchObject({ graph_code: "InternalError" });
  });

  it("un échec d'audit ne casse pas l'opération métier (best-effort)", async () => {
    const { impl } = queuedFetch([jsonResponse({ value: [] })]);
    const { client } = makeClient(impl, {
      recordAudit: async () => {
        throw new Error("audit DB down");
      },
    });
    await expect(client.listEmails()).resolves.toEqual([]);
  });
});

// ─── Garde-fou cabinet_id ────────────────────────────────────────────────────────

describe("MicrosoftGraphClient — scoping cabinet", () => {
  it("exige un cabinet_id au constructeur", () => {
    expect(() => new MicrosoftGraphClient("")).toThrow(MicrosoftGraphError);
  });

  it("toutes les lignes d'audit portent le cabinet_id du client", async () => {
    const { impl } = queuedFetch([jsonResponse({ value: [] })]);
    const { client, audits } = makeClient(impl);
    await client.listEmails();
    expect(audits.every((a) => a.cabinet_id === "cab-A")).toBe(true);
  });
});
