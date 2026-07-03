"use server";

// Run 6 — réinitialisation de mot de passe : nécessite la session recovery temporaire posée
// par Supabase après clic sur le lien reçu par email (cf. auth/callback?next=/reinitialiser-mot-de-passe).
// Même contrainte de longueur que signup/activer (12 caractères minimum).
import { createSupabaseServerClient } from "@zarya/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const Schema = z
  .object({
    password: z.string().min(12, "Au moins 12 caractères"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm"],
  });

export type ReinitialiserFieldErrors = Partial<Record<"password" | "confirm", string>>;

export type ReinitialiserState = {
  error?: string;
  fieldErrors?: ReinitialiserFieldErrors;
};

export async function reinitialiserMotDePasseAction(
  _prev: ReinitialiserState,
  formData: FormData,
): Promise<ReinitialiserState> {
  const parsed = Schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const fieldErrors: ReinitialiserFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "password" || field === "confirm") && fieldErrors[field] === undefined) {
        fieldErrors[field] = issue.message;
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { fieldErrors };
    }
    return { error: "Données invalides" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Pas de session recovery valide (lien expiré/déjà utilisé) → repartir de zéro.
  if (!user) redirect("/mot-de-passe-oublie");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Impossible de définir le mot de passe. Réessayez." };
  }

  redirect("/login");
}
