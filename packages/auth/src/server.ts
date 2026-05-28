import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase côté serveur (Server Components, Server Actions, Route Handlers)
// Gère automatiquement les cookies de session
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll peut être appelé depuis un Server Component en lecture seule.
            // Ignoré si le middleware rafraîchit déjà la session.
          }
        },
      },
    },
  );
}
