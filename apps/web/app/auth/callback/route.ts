import { createSupabaseServerClient } from "@zarya/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { accepterInvitation } from "@/lib/provisioning";

// Callback Supabase — échange le code d'autorisation contre une session
// Utilisé pour : vérification email, magic links, invitations membres
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // next= paramètre permet de surcharger la destination (ex: /onboarding)
  const next = searchParams.get("next") ?? "/onboarding";

  if (!code) {
    const errorUrl = new URL("/login", origin);
    errorUrl.searchParams.set("error", "verification_failed");
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL("/login", origin);
    errorUrl.searchParams.set("error", "verification_failed");
    return NextResponse.redirect(errorUrl);
  }

  // Récupérer l'utilisateur après échange de session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Contact RH client (invitation acces-client) : app_metadata déjà posé à l'invitation.
  // → activation (définir mot de passe) puis espace client. (Run C1)
  const role = user.app_metadata.role as string | undefined;
  if (role === "client_contact") {
    return NextResponse.redirect(new URL("/activer?next=/espace", origin));
  }

  // Cas : membre invité (pas encore de cabinet_id dans app_metadata)
  const hasCabinetId = Boolean(user.app_metadata.cabinet_id);
  if (!hasCabinetId && user.email) {
    try {
      const result = await accepterInvitation({
        userId: user.id,
        email: user.email,
      });
      if (result) {
        // Invitation acceptée → activation (définir mot de passe) puis app. (Run C1)
        return NextResponse.redirect(new URL("/activer?next=/app", origin));
      }
    } catch {
      // Invitation introuvable ou déjà acceptée — continuer vers redirect standard
    }
  }

  // Cas standard : redirect vers `next` (défaut /onboarding)
  const redirectUrl = new URL(next, origin);
  return NextResponse.redirect(redirectUrl);
}
