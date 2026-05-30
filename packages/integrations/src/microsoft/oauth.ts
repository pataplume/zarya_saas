// Flux OAuth 2.0 Authorization Code (+ refresh) Microsoft identity platform.
// Tout passe par des route handlers serveur (CORS/secrets — CLAUDE.md §7). Ce module
// est volontairement sans état et sans DB : il est testé en isolant `fetch` (mocks),
// ce qui couvre le DoD D1 « tests échange code + refresh ».

import { MicrosoftGraphError } from "./errors";
import type { MicrosoftOAuthConfig, MicrosoftTokenResponse, MicrosoftTokenSet } from "./types";

// Scopes de moindre privilège (DoD D1 / microsoft-integration.md).
export const MICROSOFT_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
] as const;

// Marge de refresh proactif : on rafraîchit 5 min avant l'expiration réelle.
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const TIMEOUT_MS = 10_000;

function authority(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
}

/**
 * Lit la configuration OAuth depuis l'environnement serveur. Lève `config_missing`
 * si un secret obligatoire manque (jamais de valeur par défaut pour un secret).
 */
export function getMicrosoftOAuthConfig(): MicrosoftOAuthConfig {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const clientId = env?.MS_CLIENT_ID;
  const clientSecret = env?.MS_CLIENT_SECRET;
  const redirectUri = env?.MS_REDIRECT_URI;
  // 'common' = multi-tenant (n'importe quel tenant Azure AD), défaut documenté.
  const tenant = env?.MS_TENANT && env.MS_TENANT.length > 0 ? env.MS_TENANT : "common";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new MicrosoftGraphError(
      "config_missing",
      "Configuration Microsoft OAuth incomplète (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_REDIRECT_URI requis côté serveur).",
    );
  }
  return { clientId, clientSecret, redirectUri, tenant, scopes: [...MICROSOFT_SCOPES] };
}

/** Construit l'URL d'autorisation vers laquelle rediriger l'utilisateur. */
export function buildAuthorizationUrl(config: MicrosoftOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: config.scopes.join(" "),
    state,
    // Force le refresh_token (offline_access déjà demandé) + consentement explicite.
    prompt: "consent",
  });
  return `${authority(config.tenant)}/authorize?${params.toString()}`;
}

async function postToken(
  config: MicrosoftOAuthConfig,
  body: URLSearchParams,
  failureCode: "oauth_exchange" | "oauth_refresh",
): Promise<MicrosoftTokenResponse> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${authority(config.tenant)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new MicrosoftGraphError(failureCode, "Microsoft n'a pas répondu dans les 10 secondes.");
    }
    throw new MicrosoftGraphError(
      failureCode,
      "Erreur réseau lors de l'appel OAuth Microsoft.",
      err,
    );
  } finally {
    clearTimeout(id);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    throw new MicrosoftGraphError(failureCode, "Réponse OAuth Microsoft non parseable.", err);
  }

  if (!response.ok) {
    const errCode =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : undefined;
    // invalid_grant sur un refresh = jeton révoqué/expiré → l'utilisateur doit reconnecter.
    if (failureCode === "oauth_refresh" && errCode === "invalid_grant") {
      throw new MicrosoftGraphError("revoked", "Le refresh_token Microsoft est révoqué ou expiré.");
    }
    throw new MicrosoftGraphError(
      failureCode,
      `Microsoft a retourné une erreur OAuth (${errCode ?? response.status}).`,
    );
  }

  return data as MicrosoftTokenResponse;
}

function toTokenSet(
  resp: MicrosoftTokenResponse,
  fallbackRefresh: string | undefined,
  now: number,
): MicrosoftTokenSet {
  const refresh = resp.refresh_token ?? fallbackRefresh;
  if (!refresh) {
    throw new MicrosoftGraphError(
      "oauth_exchange",
      "Aucun refresh_token retourné (offline_access manquant ?).",
    );
  }
  return {
    access_token: resp.access_token,
    refresh_token: refresh,
    token_type: resp.token_type,
    scope: resp.scope,
    expires_at: new Date(now + resp.expires_in * 1000).toISOString(),
  };
}

/** Échange le `code` d'autorisation contre un jeu de tokens. */
export async function exchangeCodeForTokens(
  config: MicrosoftOAuthConfig,
  code: string,
  now: number = Date.now(),
): Promise<MicrosoftTokenSet> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    scope: config.scopes.join(" "),
  });
  const resp = await postToken(config, body, "oauth_exchange");
  return toTokenSet(resp, undefined, now);
}

/**
 * Rafraîchit l'access_token à partir d'un refresh_token. Microsoft peut faire tourner
 * le refresh_token : on garde le nouveau s'il est fourni, sinon on réutilise l'ancien.
 */
export async function refreshAccessToken(
  config: MicrosoftOAuthConfig,
  refreshToken: string,
  now: number = Date.now(),
): Promise<MicrosoftTokenSet> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: config.scopes.join(" "),
  });
  const resp = await postToken(config, body, "oauth_refresh");
  return toTokenSet(resp, refreshToken, now);
}

/** Vrai si le jeu de tokens expire dans moins de REFRESH_MARGIN_MS (refresh proactif). */
export function isAccessTokenExpiring(
  tokens: MicrosoftTokenSet,
  now: number = Date.now(),
): boolean {
  return new Date(tokens.expires_at).getTime() - now <= REFRESH_MARGIN_MS;
}
