"use server";

// Run C1 — activation de compte invité : définir son mot de passe. Après l'invitation
// Supabase (membre ou contact RH client), l'utilisateur a une session mais PAS de mot de
// passe → sans cet écran il ne pourrait jamais se reconnecter. Destination interne validée
// (anti open-redirect).
import { createSupabaseServerClient } from "@zarya/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const DESTINATIONS = new Set(["/app", "/espace"]);

const Schema = z
  .object({
    password: z.string().min(12, "Au moins 12 caractères"),
    confirm: z.string(),
    next: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm"],
  });

export type ActiverState = { error?: string };

export async function definirMotDePasseAction(
  _prev: ActiverState,
  formData: FormData,
): Promise<ActiverState> {
  const parsed = Schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Données invalides" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Impossible de définir le mot de passe. Réessayez." };
  }

  // Anti open-redirect : seules des destinations internes connues sont autorisées.
  const dest = DESTINATIONS.has(parsed.data.next) ? parsed.data.next : "/app";
  redirect(dest);
}
