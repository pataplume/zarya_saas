import {
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  MicrosoftGraphError,
  saveMicrosoftTokens,
  verifyOAuthState,
} from "@zarya/integrations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc D1 — callback OAuth Microsoft. Public (redirection depuis
// login.microsoftonline.com) : la liaison au cabinet repose sur le `state` SIGNÉ, pas
// sur la session. Échange le code contre des tokens, qui sont stockés CHIFFRÉS (Vault)
// — jamais en clair, jamais loggués (ADR 0013 addendum).

function redirectToSettings(
  request: NextRequest,
  status: "connected" | "error",
  detail?: string,
): NextResponse {
  const url = new URL("/parametres/integrations", request.nextUrl.origin);
  url.searchParams.set("microsoft", status);
  if (detail) url.searchParams.set("detail", detail);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  // L'utilisateur a refusé le consentement, ou Microsoft a renvoyé une erreur.
  const oauthError = params.get("error");
  if (oauthError) {
    return redirectToSettings(request, "error", "refus_ou_erreur");
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return redirectToSettings(request, "error", "parametres_manquants");
  }

  let cabinet_id: string;
  try {
    cabinet_id = verifyOAuthState(state).cabinet_id;
  } catch {
    // State absent / signature invalide / expiré → anti-CSRF.
    return redirectToSettings(request, "error", "state_invalide");
  }

  try {
    const config = getMicrosoftOAuthConfig();
    const tokens = await exchangeCodeForTokens(config, code);
    await saveMicrosoftTokens(cabinet_id, tokens);
    return redirectToSettings(request, "connected");
  } catch (err) {
    const detail = err instanceof MicrosoftGraphError ? err.code : "inconnu";
    return redirectToSettings(request, "error", detail);
  }
}
