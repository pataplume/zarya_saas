import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (composants client uniquement)
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, validated by infrastructure
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
