import { afterEach, describe, expect, it, vi } from "vitest";
import { MicrosoftGraphError } from "./errors";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  isAccessTokenExpiring,
  MICROSOFT_SCOPES,
  refreshAccessToken,
} from "./oauth";
import { signOAuthState, verifyOAuthState } from "./state";
import type { MicrosoftOAuthConfig, MicrosoftTokenSet } from "./types";

const config: MicrosoftOAuthConfig = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  tenant: "common",
  redirectUri: "https://app.zarya.test/api/integrations/microsoft/callback",
  scopes: [...MICROSOFT_SCOPES],
};

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildAuthorizationUrl", () => {
  it("inclut client_id, redirect_uri, scopes de moindre privilège et state", () => {
    const url = new URL(buildAuthorizationUrl(config, "signed-state-123"));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe("signed-state-123");
    expect(url.searchParams.get("scope")).toBe(MICROSOFT_SCOPES.join(" "));
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });
});

describe("exchangeCodeForTokens", () => {
  it("échange le code et calcule expires_at depuis expires_in", async () => {
    const now = 1_700_000_000_000;
    const spy = mockFetch({
      access_token: "AT-1",
      refresh_token: "RT-1",
      token_type: "Bearer",
      scope: MICROSOFT_SCOPES.join(" "),
      expires_in: 3600,
    });

    const tokens = await exchangeCodeForTokens(config, "auth-code", now);

    expect(tokens.access_token).toBe("AT-1");
    expect(tokens.refresh_token).toBe("RT-1");
    expect(tokens.expires_at).toBe(new Date(now + 3600 * 1000).toISOString());

    // Le code part bien dans un POST form-urlencoded vers le endpoint token.
    const [calledUrl, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("code=auth-code");
  });

  it("lève oauth_exchange sur réponse non-OK", async () => {
    mockFetch({ error: "invalid_request" }, false, 400);
    await expect(exchangeCodeForTokens(config, "bad-code")).rejects.toMatchObject({
      code: "oauth_exchange",
    });
  });

  it("lève oauth_exchange si aucun refresh_token (offline_access manquant)", async () => {
    mockFetch({ access_token: "AT", token_type: "Bearer", scope: "User.Read", expires_in: 3600 });
    await expect(exchangeCodeForTokens(config, "code")).rejects.toBeInstanceOf(MicrosoftGraphError);
  });
});

describe("refreshAccessToken", () => {
  it("retourne le nouveau refresh_token quand Microsoft en fournit un", async () => {
    const now = 1_700_000_000_000;
    mockFetch({
      access_token: "AT-2",
      refresh_token: "RT-2",
      token_type: "Bearer",
      scope: MICROSOFT_SCOPES.join(" "),
      expires_in: 3600,
    });
    const tokens = await refreshAccessToken(config, "RT-1", now);
    expect(tokens.access_token).toBe("AT-2");
    expect(tokens.refresh_token).toBe("RT-2");
  });

  it("réutilise l'ancien refresh_token quand Microsoft n'en renvoie pas", async () => {
    mockFetch({ access_token: "AT-2", token_type: "Bearer", scope: "User.Read", expires_in: 3600 });
    const tokens = await refreshAccessToken(config, "RT-OLD");
    expect(tokens.refresh_token).toBe("RT-OLD");
  });

  it("mappe invalid_grant vers le code 'revoked'", async () => {
    mockFetch({ error: "invalid_grant" }, false, 400);
    await expect(refreshAccessToken(config, "RT-DEAD")).rejects.toMatchObject({ code: "revoked" });
  });
});

describe("isAccessTokenExpiring", () => {
  const base: Omit<MicrosoftTokenSet, "expires_at"> = {
    access_token: "AT",
    refresh_token: "RT",
    token_type: "Bearer",
    scope: "User.Read",
  };

  it("vrai dans la marge de 5 min, faux au-delà", () => {
    const now = 1_700_000_000_000;
    expect(
      isAccessTokenExpiring({ ...base, expires_at: new Date(now + 4 * 60_000).toISOString() }, now),
    ).toBe(true);
    expect(
      isAccessTokenExpiring(
        { ...base, expires_at: new Date(now + 30 * 60_000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
});

describe("getMicrosoftOAuthConfig", () => {
  it("lève config_missing si un secret serveur manque", () => {
    const saved = { ...process.env };
    // Assigner `undefined` à process.env le coerce en string "undefined" (truthy) :
    // on supprime vraiment les clés pour simuler l'absence de secret serveur.
    delete process.env.MS_CLIENT_ID;
    delete process.env.MS_CLIENT_SECRET;
    delete process.env.MS_REDIRECT_URI;
    try {
      expect(() => getMicrosoftOAuthConfig()).toThrow(MicrosoftGraphError);
    } finally {
      process.env = saved;
    }
  });
});

describe("OAuth state signé (anti-CSRF + liaison cabinet)", () => {
  const cabinet_id = "11111111-1111-1111-1111-111111111111";

  it("round-trip sign → verify restitue le cabinet_id", () => {
    process.env.MS_OAUTH_STATE_SECRET = "super-secret-de-test-12345";
    const state = signOAuthState(cabinet_id);
    expect(verifyOAuthState(state).cabinet_id).toBe(cabinet_id);
  });

  it("rejette un state falsifié (signature invalide)", () => {
    process.env.MS_OAUTH_STATE_SECRET = "super-secret-de-test-12345";
    const state = signOAuthState(cabinet_id);
    const [payload] = state.split(".");
    expect(() => verifyOAuthState(`${payload}.tampered`)).toThrow(MicrosoftGraphError);
  });

  it("rejette un state signé avec une autre clé", () => {
    process.env.MS_OAUTH_STATE_SECRET = "secret-A-1234567890";
    const state = signOAuthState(cabinet_id);
    process.env.MS_OAUTH_STATE_SECRET = "secret-B-1234567890";
    expect(() => verifyOAuthState(state)).toThrow(MicrosoftGraphError);
  });
});
