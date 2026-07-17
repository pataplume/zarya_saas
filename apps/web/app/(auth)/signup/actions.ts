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

  // Message honnête quand l'email existe déjà (P0-8b) : l'ancien faux succès
  // (« Vérifiez votre email ») laissait l'utilisateur attendre un email qui
  // n'arrivait jamais. Arbitrage assumé : ce message révèle l'existence du compte,
  // au même niveau que « Mot de passe oublié » — pas de détail supplémentaire.
  const EMAIL_DEJA_ENREGISTRE =
    "Un compte existe déjà pour cet email — connectez-vous ou utilisez « Mot de passe oublié ».";

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: EMAIL_DEJA_ENREGISTRE };
    }
    return { error: "Une erreur est survenue. Réessayez." };
  }

  // Confirmations email activées : Supabase ne renvoie PAS d'erreur pour un email
  // déjà enregistré mais un user factice avec `identities: []` (id aléatoire
  // inexistant dans auth.users). Sans ce garde, on provisionnait un cabinet
  // fantôme rattaché à ce faux id ET on affichait un faux succès.
  if (authData.user && (authData.user.identities?.length ?? 0) === 0) {
    return { error: EMAIL_DEJA_ENREGISTRE };
  }

  // Provisioning du cabinet (atomique) : cabinet + membre + session onboarding
  if (authData.user) {
    try {
      await provisionNewCabinet({
        userId: authData.user.id,
        email: parsed.data.email,
      });
    } catch (err) {
      // Le compte auth.users est créé sans cabinet : le self-heal /auth/reparer (P0-8)
      // reprendra la configuration à la prochaine connexion.
      // Contexte minimal (user_id technique), jamais l'email ni le mot de passe.
      logger.error(
        {
          user_id: authData.user.id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[signup] provisioning cabinet échoué",
      );
      return {
        error:
          "Votre compte a été créé mais sa configuration a échoué. Confirmez votre email puis connectez-vous : la configuration reprendra automatiquement.",
      };
    }
  }

  return {
    success: true,
    email: parsed.data.email,
  };
}
