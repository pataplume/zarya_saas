"use server";

import { createSupabaseServerClient } from "@zarya/auth";
import { redirect } from "next/navigation";

// Déconnexion propre à l'espace client (même implémentation que /app/actions.ts,
// dupliquée pour éviter un import cross-surface fiduciaire → client).
export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
