"use server";

import { requireAuth } from "@zarya/auth";
import { cabinet, db, sessionOnboardingFiduciaire } from "@zarya/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

// ─── Sauvegarde identité cabinet ─────────────────────────────────────────────

const IdentiteSchema = z.object({
  raison_sociale: z.string().min(1, "La raison sociale est requise"),
  ide: z
    .string()
    .regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/, "Format IDE invalide (CHE-XXX.XXX.XXX)")
    .optional()
    .or(z.literal("")),
  zefix_ehraid: z.string().optional(),
  forme_juridique: z.string().optional(),
  adresse_rue: z.string().optional(),
  adresse_npa: z.string().optional(),
  adresse_ville: z.string().optional(),
  adresse_canton: z.string().optional(),
  tva_numero: z.string().optional(),
  langues: z.array(z.enum(["fr", "de", "it", "en"])).min(1, "Sélectionnez au moins une langue"),
  langue_principale: z.enum(["fr", "de", "it", "en"]),
  site_web: z.string().url("URL invalide").optional().or(z.literal("")),
  telephone: z.string().optional(),
});

export type IdentiteState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function sauvegarderIdentiteAction(
  _prev: IdentiteState,
  formData: FormData,
): Promise<IdentiteState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  // Les langues sont des checkboxes multiples
  const langues = formData.getAll("langues") as string[];

  const parsed = IdentiteSchema.safeParse({
    raison_sociale: formData.get("raison_sociale"),
    ide: formData.get("ide") || undefined,
    zefix_ehraid: formData.get("zefix_ehraid") || undefined,
    forme_juridique: formData.get("forme_juridique") || undefined,
    adresse_rue: formData.get("adresse_rue") || undefined,
    adresse_npa: formData.get("adresse_npa") || undefined,
    adresse_ville: formData.get("adresse_ville") || undefined,
    adresse_canton: formData.get("adresse_canton") || undefined,
    tva_numero: formData.get("tva_numero") || undefined,
    langues: langues.length > 0 ? langues : ["fr"],
    langue_principale: formData.get("langue_principale") || "fr",
    site_web: formData.get("site_web") || undefined,
    telephone: formData.get("telephone") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field) fieldErrors[String(field)] = issue.message;
    }
    return { fieldErrors };
  }

  const d = parsed.data;

  // Mettre à jour crm.cabinet
  await db
    .update(cabinet)
    .set({
      raison_sociale: d.raison_sociale,
      ide: d.ide || null,
      zefix_ehraid: d.zefix_ehraid || null,
      forme_juridique: d.forme_juridique || null,
      adresse_rue: d.adresse_rue || null,
      adresse_npa: d.adresse_npa || null,
      adresse_ville: d.adresse_ville || null,
      adresse_canton: d.adresse_canton || null,
      tva_numero: d.tva_numero || null,
      langues_operationnelles: d.langues,
      langue_principale: d.langue_principale,
      site_web: d.site_web || null,
      telephone: d.telephone || null,
      updated_at: new Date(),
    })
    .where(eq(cabinet.id, cabinet_id));

  // Avancer la session onboarding
  await db
    .update(sessionOnboardingFiduciaire)
    .set({
      statut: "etape_a_terminee",
      etape_a_terminee_at: new Date(),
      date_derniere_activite: new Date(),
      updated_at: new Date(),
    })
    .where(eq(sessionOnboardingFiduciaire.cabinet_id, cabinet_id));

  redirect("/onboarding/equipe");
}
