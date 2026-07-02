"use server";

import { createSupabaseServerClient } from "@zarya/auth";
import { logger } from "@zarya/logger";
import { z } from "zod";
import { provisionNewCabinet } from "@/lib/provisioning";

const SignupSchema = z
  .object({
    email: z.string().email("Adresse email invalide"),
    password: z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères"),
    confirmPassword: z.string(),
    acceptCgu: z.literal("on", { errorMap: () => ({ message: "Vous devez accepter les CGU" }) }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

const SIGNUP_FIELDS = ["email", "password", "confirmPassword", "acceptCgu"] as const;
type SignupField = (typeof SIGNUP_FIELDS)[number];

export type SignupFieldErrors = Partial<Record<SignupField, string>>;

export type SignupState = {
  error?: string;
  fieldErrors?: SignupFieldErrors;
  success?: boolean;
  email?: string;
};

function isSignupField(value: unknown): value is SignupField {
  return (SIGNUP_FIELDS as readonly unknown[]).includes(value);
}

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptCgu: formData.get("acceptCgu"),
  });

  if (!parsed.success) {
    // Erreurs par champ (1re erreur de chaque champ) pour affichage sous les inputs.
    const fieldErrors: SignupFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (isSignupField(field) && fieldErrors[field] === undefined) {
        fieldErrors[field] = issue.message;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors };
    }
    return { error: "Données invalides" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Redirection après vérification email → wizard onboarding
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });

  if (authError) {
    // Ne pas révéler si l'email existe déjà (sécurité)
    if (authError.message.includes("already registered")) {
      return { success: true, email: parsed.data.email };
    }
    return { error: "Une erreur est survenue. Réessayez." };
  }

  // Provisioning du cabinet (atomique) : cabinet + membre + session onboarding
  if (authData.user) {
    try {
      await provisionNewCabinet({
        userId: authData.user.id,
        email: parsed.data.email,
      });
    } catch (err) {
      // On retourne l'erreur mais le compte auth.users est créé — support peut corriger.
      // Contexte minimal (user_id technique), jamais l'email ni le mot de passe.
      logger.error(
        {
          user_id: authData.user.id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[signup] provisioning cabinet échoué",
      );
      return { error: "Compte créé mais erreur de configuration. Contactez le support." };
    }
  }

  return {
    success: true,
    email: parsed.data.email,
  };
}
