"use server";

import { requireAuth } from "@zarya/auth";
import { cabinet, db } from "@zarya/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CabinetSchema = z.object({
  raison_sociale: z.string().min(1, "Raison sociale requise").max(200),
  email_contact: z.string().email("Email invalide").or(z.literal("")).optional(),
  telephone: z.string().max(30).optional(),
  site_web: z.string().url("URL invalide").or(z.literal("")).optional(),
  adresse_rue: z.string().max(200).optional(),
  adresse_npa: z.string().max(10).optional(),
  adresse_ville: z.string().max(100).optional(),
  adresse_canton: z.string().max(2).optional(),
  tva_numero: z.string().max(20).optional(),
  langue_principale: z.enum(["fr", "de", "it", "en"]).optional(),
  devise: z.enum(["CHF", "EUR"]).optional(),
  fuseau_horaire: z.string().max(50).optional(),
});

export type SauvegarderCabinetState = { error?: string; success?: boolean };

export async function sauvegarderCabinetAction(
  _prev: SauvegarderCabinetState,
  formData: FormData,
): Promise<SauvegarderCabinetState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return { error: "Action réservée au responsable" };

  // Transformer les champs vides en undefined pour ne pas écraser avec ""
  function opt(val: FormDataEntryValue | null): string | undefined {
    const s = String(val ?? "").trim();
    return s === "" ? undefined : s;
  }

  const raw = {
    raison_sociale: String(formData.get("raison_sociale") ?? "").trim(),
    email_contact: opt(formData.get("email_contact")),
    telephone: opt(formData.get("telephone")),
    site_web: opt(formData.get("site_web")),
    adresse_rue: opt(formData.get("adresse_rue")),
    adresse_npa: opt(formData.get("adresse_npa")),
    adresse_ville: opt(formData.get("adresse_ville")),
    adresse_canton: opt(formData.get("adresse_canton")),
    tva_numero: opt(formData.get("tva_numero")),
    langue_principale: opt(formData.get("langue_principale")),
    devise: opt(formData.get("devise")),
    fuseau_horaire: opt(formData.get("fuseau_horaire")),
  };

  const parsed = CabinetSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  await db
    .update(cabinet)
    .set({ ...parsed.data, updated_at: new Date() })
    .where(eq(cabinet.id, cabinet_id));

  revalidatePath("/app/parametres/cabinet");
  revalidatePath("/app"); // Revalide le dashboard (nom cabinet dans la carte)
  return { success: true };
}

// ── Branding portail client (/espace) ────────────────────────────────────────
// Colonnes crm.cabinet.logo_url / couleur_primaire / couleur_secondaire (Bloc F2).
// null → resolveBranding (lib/client-space.ts) retombe sur les défauts ZARYA.

const HEX_COULEUR = /^#[0-9a-fA-F]{6}$/;

const BrandingSchema = z.object({
  couleur_primaire: z
    .string()
    .regex(HEX_COULEUR, "Format attendu : #RRGGBB (ex. #1e3a8a)")
    .nullable(),
  couleur_secondaire: z
    .string()
    .regex(HEX_COULEUR, "Format attendu : #RRGGBB (ex. #475569)")
    .nullable(),
  logo_url: z
    .string()
    .url("URL invalide")
    .startsWith("https://", "L'URL du logo doit être en https://")
    .max(500, "URL trop longue (500 caractères max)")
    .nullable(),
});

type BrandingField = keyof z.infer<typeof BrandingSchema>;

export type SauvegarderBrandingState = {
  error?: string;
  fieldErrors?: Partial<Record<BrandingField, string>>;
  success?: boolean;
};

export async function sauvegarderBrandingAction(
  _prev: SauvegarderBrandingState,
  formData: FormData,
): Promise<SauvegarderBrandingState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return { error: "Action réservée au responsable" };

  // Champ vide → null : retour aux défauts ZARYA (resolveBranding).
  function nul(val: FormDataEntryValue | null): string | null {
    const s = String(val ?? "").trim();
    return s === "" ? null : s;
  }

  // Bouton « Réinitialiser aux couleurs ZARYA » : les 3 colonnes à null.
  const raw =
    formData.get("intent") === "reset"
      ? { couleur_primaire: null, couleur_secondaire: null, logo_url: null }
      : {
          couleur_primaire: nul(formData.get("couleur_primaire")),
          couleur_secondaire: nul(formData.get("couleur_secondaire")),
          logo_url: nul(formData.get("logo_url")),
        };

  const parsed = BrandingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<BrandingField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fieldErrors)) {
        fieldErrors[key as BrandingField] = issue.message;
      }
    }
    return { error: "Données invalides", fieldErrors };
  }

  await db
    .update(cabinet)
    .set({ ...parsed.data, updated_at: new Date() })
    .where(eq(cabinet.id, cabinet_id));

  revalidatePath("/app/parametres/cabinet");
  revalidatePath("/espace", "layout"); // Le branding est appliqué dans le layout du portail client
  return { success: true };
}
