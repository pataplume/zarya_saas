import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOpsAlert } from "./ops-alert";

// Tests unitaires PURS : fetch mocké, aucune connexion réseau/DB.

const WEBHOOK_URL = "https://ops.example.test/webhook";

function mockFetch(impl?: typeof fetch) {
  const fn = vi.fn(impl ?? (async () => new Response(null, { status: 200 })));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("@zarya/logger — sendOpsAlert (P0-1 observabilité)", () => {
  it("no-op silencieux si OPS_ALERT_WEBHOOK_URL absente", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "");
    const fetchMock = mockFetch();
    await sendOpsAlert("Test alerte");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST {subject, context, timestamp} en JSON vers le webhook", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", WEBHOOK_URL);
    const fetchMock = mockFetch();

    await sendOpsAlert("Microsoft Graph — accès refusé (401)", {
      provider: "microsoft_graph",
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.subject).toBe("Microsoft Graph — accès refusé (401)");
    expect(body.context).toEqual({ provider: "microsoft_graph", status: 401 });
    expect(typeof body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });

  it("context absent → objet vide (payload toujours bien formé)", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", WEBHOOK_URL);
    const fetchMock = mockFetch();

    await sendOpsAlert("Alerte sans contexte");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.context).toEqual({});
  });

  it("ne throw jamais si fetch rejette (réseau down)", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", WEBHOOK_URL);
    mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(sendOpsAlert("Alerte réseau down")).resolves.toBeUndefined();
  });

  it("ne throw jamais si le webhook répond non-2xx", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", WEBHOOK_URL);
    mockFetch(async () => new Response(null, { status: 500 }));

    await expect(sendOpsAlert("Alerte webhook 500")).resolves.toBeUndefined();
  });
});
