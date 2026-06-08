import {
  createEmailSubscription,
  detectAndPersistTenantRegion,
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  MicrosoftGraphError,
  saveMicrosoftTokens,
  verifyOAuthState,
} from "@zarya/integrations";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc D1 — callback OAuth Microsoft. Public (redirection depuis
// login.microsoftonline.com) : la liaison au cabinet repose sur le `state` SIGNÉ, pas
// sur la session. Échange le code contre des tokens, qui sont stockés CHIFFRÉS (Vault)
// — jamais en clair, jamais loggués (ADR 0013 addendum).
//
// Bloc D3 — après stockage, détection best-effort de la région du tenant. Si la région
// n'est pas adéquate (hors UE/EEE + Suisse + adéquats), on remonte `region=hors_zone`
// pour que l'UI affiche un avertissement (politique : avertir, pas bloquer). Un échec
// de détection NE bloque PAS la connexion (région inconnue ≠ refus).

function redirectToSettings(
  request: NextRequest,
  status: "connected" | "error",
  detail?: string,
  region?: "ok" | "hors_zone",
  webhook?: string,
): NextResponse {
  const url = new URL("/app/parametres/integrations", request.nextUrl.origin);
  url.searchParams.set("microsoft", status);
  if (detail) url.searchParams.set("detail", detail);
  if (region) url.searchParams.set("region", region);
  if (webhook) url.searchParams.set("webhook", webhook);
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

    // D3 — détection région best-effort (ne bloque pas la connexion).
    let region: "ok" | "hors_zone" | undefined;
    try {
      const verdict = await detectAndPersistTenantRegion(cabinet_id);
      region = verdict.isAdequate ? "ok" : "hors_zone";
    } catch (regionErr) {
      logger.warn(
        { cabinet_id, error: regionErr instanceof Error ? regionErr.message : "inconnu" },
        "[microsoft.callback] détection région tenant échouée (connexion maintenue)",
      );
    }

    // D4b — création de la subscription webhook best-effort (ne bloque pas la connexion ;
    // nécessite que l'endpoint /webhook soit joignable publiquement par Microsoft).
    let webhook = "ok";
    try {
      await createEmailSubscription(cabinet_id);
    } catch (subErr) {
      const message = subErr instanceof Error ? subErr.message : "inconnu";
      // Remonté dans l'URL (tronqué) pour que l'échec d'ingestion soit visible côté
      // responsable au lieu d'être avalé silencieusement.
      webhook = message.slice(0, 200);
      logger.warn(
        { cabinet_id, error: message },
        "[microsoft.callback] création subscription webhook échouée (connexion maintenue)",
      );
    }
    return redirectToSettings(request, "connected", undefined, region, webhook);
  } catch (err) {
    const detail = err instanceof MicrosoftGraphError ? err.code : "inconnu";
    return redirectToSettings(request, "error", detail);
  }
}
