"use server";

// Run D1 — enregistre une demande d'accès (prospect) en base (crm.demande_acces). Page
// publique : pas d'auth. Validation Zod + honeypot anti-spam basique.
import { db, demandeAcces } from "@zarya/db";
import { z } from "zod";

const Schema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(200),
  email: z.string().trim().email("Email invalide").max(320),
  cabinet_nom: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  // Honeypot : champ caché qui doit rester vide (les bots le remplissent).
  website: z.string().max(0).optional(),
});

export type DemandeState = { error?: string; success?: boolean };

export async function creerDemandeAccesAction(
  _prev: DemandeState,
  formData: FormData,
): Promise<DemandeState> {
  const parsed = Schema.safeParse({
    nom: formData.get("nom"),
    email: formData.get("email"),
    cabinet_nom: formData.get("cabinet_nom") || undefined,
    message: formData.get("message") || undefined,
    website: formData.get("website") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Formulaire invalide." };
  }
  // Honeypot rempli → on fait comme si tout allait bien, sans rien enregistrer.
  if (parsed.data.website) return { success: true };

  try {
    await db.insert(demandeAcces).values({
      nom: parsed.data.nom,
      email: parsed.data.email,
      cabinet_nom: parsed.data.cabinet_nom ?? null,
      message: parsed.data.message ?? null,
    });
    return { success: true };
  } catch {
    return { error: "Une erreur est survenue. Réessayez." };
  }
}
