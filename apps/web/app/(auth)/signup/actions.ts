"use server";

import { createSupabaseServerClient } from "@zarya/auth";
import { z } from "zod";

const SignupSchema = z
  .object({
    email: z.string().email("Adresse email invalide"),
    password: z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export type SignupState = {
  error?: string;
  success?: boolean;
  email?: string;
};

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Données invalides" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Redirection après vérification email
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    // Ne pas révéler si l'email existe déjà (sécurité)
    if (error.message.includes("already registered")) {
      return {
        success: true,
        email: parsed.data.email,
      };
    }
    return { error: "Une erreur est survenue. Réessayez." };
  }

  return {
    success: true,
    email: parsed.data.email,
  };
}
