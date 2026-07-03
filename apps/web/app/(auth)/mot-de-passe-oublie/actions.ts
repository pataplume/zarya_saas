"use server";

// Run 6 — mot de passe oublié : envoie le lien de réinitialisation Supabase Auth.
// Message de confirmation volontairement générique (anti-énumération de comptes) :
// on ne révèle jamais si l'email correspond à un compte existant.
import { createSupabaseServerClient } from "@zarya/auth";
import { logger } from "@zarya/logger";
import { z } from "zod";

const MotDePasseOublieSchema = z.object({
  email: z.string().email("Adresse email invalide"),
});

export type MotDePasseOublieState = {
  error?: string;
  success?: boolean;
};

export async function demanderReinitialisationAction(
  _prevState: MotDePasseOublieState,
  formData: FormData,
): Promise<MotDePasseOublieState> {
  const parsed = MotDePasseOublieSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Données invalides" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/reinitialiser-mot-de-passe`,
  });

  if (error) {
    // Log technique uniquement (jamais l'email en clair, cf. redact PII) — l'utilisateur
    // reçoit toujours le même message de succès générique, quoi qu'il arrive côté Supabase.
    logger.error(
      { error: `${error.name}: ${error.message}` },
      "[mot-de-passe-oublie] échec resetPasswordForEmail",
    );
  }

  // Toujours "succès" côté utilisateur : ne jamais confirmer/infirmer l'existence du compte.
  return { success: true };
}
