"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (composants client uniquement)
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
