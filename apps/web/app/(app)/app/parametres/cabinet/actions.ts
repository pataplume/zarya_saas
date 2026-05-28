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
