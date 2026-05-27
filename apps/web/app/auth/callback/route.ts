import { createSupabaseServerClient } from "@zarya/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Callback Supabase — échange le code d'autorisation contre une session
// Utilisé pour : vérification email, magic links
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectUrl = new URL(next, origin);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Erreur : rediriger vers login avec message
  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", "verification_failed");
  return NextResponse.redirect(errorUrl);
}
