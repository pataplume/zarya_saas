import { createSupabaseServerClient } from "@zarya/auth";
import {
  buildAuthorizationUrl,
  getMicrosoftOAuthConfig,
  MicrosoftGraphError,
  signOAuthState,
} from "@zarya/integrations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc D1 — initiation OAuth Microsoft. Route handler obligatoire (secrets serveur,
// pas d'appel tiers côté client — CLAUDE.md §7). Authentifié : on lie le flux au
// cabinet de l'utilisateur courant via un `state` signé (anti-CSRF).

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    return NextResponse.json(
      { error: "Aucun cabinet associé : terminez l'onboarding avant de connecter Microsoft." },
      { status: 403 },
    );
  }

  try {
    const config = getMicrosoftOAuthConfig();
    const state = signOAuthState(cabinet_id);
    const url = buildAuthorizationUrl(config, state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg =
      err instanceof MicrosoftGraphError
        ? "L'intégration Microsoft n'est pas configurée côté serveur."
        : "Impossible d'initier la connexion Microsoft.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
