import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Rafraîchit la session Supabase dans le middleware Next.js
// IMPORTANT : ne pas exécuter de code entre createServerClient et getUser()
// Référence : https://supabase.com/docs/guides/auth/server-side/nextjs
export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Rafraîchit le token si expiré
  // Ne jamais exécuter de logique entre ici et getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rediriger vers /login si la route est protégée et l'utilisateur non connecté
  const { pathname } = request.nextUrl;
  const isProtectedRoute = pathname.startsWith("/app");
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (isProtectedRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Rediriger vers /app si déjà connecté et sur une page auth
  if (isAuthRoute && user) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/app";
    return NextResponse.redirect(appUrl);
  }

  return supabaseResponse;
}
