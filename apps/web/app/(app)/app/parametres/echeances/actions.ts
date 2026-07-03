"use server";

// Écran /parametres/echeances — server actions sur le catalogue calendar.
// template_echeance (RUN 7, PLAN-USABILITE-MVP.md). Un cabinet ne crée et ne
// modifie QUE ses propres templates (cabinet_id = acteur.cabinet_id) — jamais
// un template global (cabinet_id NULL, catalogue fédéral seedé migration
// 0008) : ces lignes sont des références ZARYA, jamais touchées par un
// cabinet, même en RBAC responsable. RBAC réservé au rôle responsable, comme
// /parametres/conformite et /parametres/integrations. Anti-fuite : pattern
// générique { error: "introuvable" } déjà établi ailleurs dans le repo — ne
// jamais confirmer l'existence d'un template hors-scope (autre cabinet ou
// global). Aucune migration, aucune nouvelle valeur d'enum sur crm.* (Bloc A
// scellé) : l'audit réutilise crm.evenement type "note_ajoutee" avec un
// metadata.contexte distinctif, comme conformite/actions.ts.
import { requireAuth } from "@zarya/auth";
import { db, evenement, templateEcheance, typeEcheanceEnum } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const PATH = "/app/parametres/echeances";

const TYPES_ECHEANCE = typeEcheanceEnum.enumValues;
const FREQUENCES = [
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
  "evenement",
] as const;

export type TemplateEcheanceActionState = { error?: string; success?: boolean };

async function requireResponsable(): Promise<
  { cabinet_id: string; user_id: string } | { error: string }
> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = (user.app_metadata.role as string | undefined) ?? "collaborateur";
  if (role !== "responsable") {
    return { error: "Seul un responsable du cabinet peut gérer le catalogue des échéances." };
  }
  return { cabinet_id, user_id: user.id };
}

// "" / absent → undefined ; sinon liste dédupliquée (saisie séparée par virgule).
function parseListe(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const items = value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

// Variante entiers pour mois_dans_annee (1-12).
function parseListeEntiers(value: FormDataEntryValue | null): number[] | undefined {
  const items = parseListe(value);
  if (!items) return undefined;
  const nombres = items.map((i) => Number(i)).filter((n) => Number.isInteger(n));
  return nombres.length > 0 ? Array.from(new Set(nombres)) : undefined;
}

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

function optionnelInt(value: FormDataEntryValue | null): number | undefined {
  const s = optionnel(value);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isInteger(n) ? n : undefined;
}

const templateChampsSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis.").max(200, "Nom trop long (200 caractères max)."),
  type_echeance: z.enum(TYPES_ECHEANCE as [string, ...string[]], {
    message: "Type d'échéance invalide.",
  }),
  frequence: z.enum(FREQUENCES, { message: "Fréquence invalide." }),
  service_requis: z.array(z.string()).optional(),
  canton_specifique: z.array(z.string()).optional(),
  regime_tva: z.array(z.string()).optional(),
  jour_du_mois: z
    .number()
    .int()
    .min(1, "Jour du mois entre 1 et 31.")
    .max(31, "Jour du mois entre 1 et 31.")
    .optional(),
  mois_dans_annee: z.array(z.number().int().min(1).max(12)).optional(),
  date_specifique: z.string().optional(),
  delai_alerte_jours: z.number().int().min(0, "Doit être ≥ 0.").max(365, "Trop élevé (max 365)."),
  jours_entre_relances: z.number().int().min(0, "Doit être ≥ 0.").max(365, "Trop élevé (max 365)."),
  max_relances_auto: z.number().int().min(0, "Doit être ≥ 0.").max(20, "Trop élevé (max 20)."),
  documents_requis_types: z.array(z.string()).optional(),
  description: z.string().trim().max(2000, "Description trop longue (2000 max).").optional(),
});

function champsFromFormData(formData: FormData) {
  return {
    nom: formData.get("nom"),
    type_echeance: formData.get("type_echeance"),
    frequence: formData.get("frequence"),
    service_requis: parseListe(formData.get("service_requis")),
    canton_specifique: parseListe(formData.get("canton_specifique")),
    regime_tva: parseListe(formData.get("regime_tva")),
    jour_du_mois: optionnelInt(formData.get("jour_du_mois")),
    mois_dans_annee: parseListeEntiers(formData.get("mois_dans_annee")),
    date_specifique: optionnel(formData.get("date_specifique")),
    delai_alerte_jours: optionnelInt(formData.get("delai_alerte_jours")) ?? 7,
    jours_entre_relances: optionnelInt(formData.get("jours_entre_relances")) ?? 3,
    max_relances_auto: optionnelInt(formData.get("max_relances_auto")) ?? 3,
    documents_requis_types: parseListe(formData.get("documents_requis_types")),
    description: optionnel(formData.get("description")),
  };
}

// ─── Créer un template (toujours scopé au cabinet de l'acteur) ────────────────

export async function creerTemplateEcheanceAction(
  _prev: TemplateEcheanceActionState,
  formData: FormData,
): Promise<TemplateEcheanceActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const parsed = templateChampsSchema.safeParse(champsFromFormData(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const champs = parsed.data;

  const [created] = await db
    .insert(templateEcheance)
    .values({
      cabinet_id: auth.cabinet_id,
      nom: champs.nom,
      type_echeance: champs.type_echeance as (typeof TYPES_ECHEANCE)[number],
      frequence: champs.frequence,
      service_requis: champs.service_requis,
      canton_specifique: champs.canton_specifique,
      regime_tva: champs.regime_tva,
      jour_du_mois: champs.jour_du_mois,
      mois_dans_annee: champs.mois_dans_annee,
      date_specifique: champs.date_specifique,
      delai_alerte_jours: champs.delai_alerte_jours,
      jours_entre_relances: champs.jours_entre_relances,
      max_relances_auto: champs.max_relances_auto,
      documents_requis_types: champs.documents_requis_types,
      description: champs.description,
      created_by: auth.user_id,
    })
    .returning({ id: templateEcheance.id });

  if (!created) return { error: "Échec de la création." };

  await db.insert(evenement).values({
    cabinet_id: auth.cabinet_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: auth.user_id,
    ressource_type: "calendar.template_echeance",
    ressource_id: created.id,
    description: `Modèle d'échéance créé — ${champs.nom}`,
    metadata: { contexte: "template_echeance_cree", nom: champs.nom, type: champs.type_echeance },
  });

  revalidatePath(PATH);
  return { success: true };
}

// ─── Modifier un template (scope cabinet strict, jamais un global) ────────────

const modifierSchema = templateChampsSchema.extend({
  id: z.string().uuid(),
});

export async function modifierTemplateEcheanceAction(
  _prev: TemplateEcheanceActionState,
  formData: FormData,
): Promise<TemplateEcheanceActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const parsed = modifierSchema.safeParse({
    id: formData.get("id"),
    ...champsFromFormData(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const { id, ...champs } = parsed.data;

  // Anti-fuite : le template doit appartenir STRICTEMENT à ce cabinet — un
  // cabinet_id NULL (global) ou d'un autre cabinet renvoie "introuvable",
  // jamais un message confirmant l'existence d'un template hors-scope.
  const [cible] = await db
    .select({ id: templateEcheance.id })
    .from(templateEcheance)
    .where(and(eq(templateEcheance.id, id), eq(templateEcheance.cabinet_id, auth.cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Template introuvable." };

  await db
    .update(templateEcheance)
    .set({
      nom: champs.nom,
      type_echeance: champs.type_echeance as (typeof TYPES_ECHEANCE)[number],
      frequence: champs.frequence,
      service_requis: champs.service_requis,
      canton_specifique: champs.canton_specifique,
      regime_tva: champs.regime_tva,
      jour_du_mois: champs.jour_du_mois,
      mois_dans_annee: champs.mois_dans_annee,
      date_specifique: champs.date_specifique,
      delai_alerte_jours: champs.delai_alerte_jours,
      jours_entre_relances: champs.jours_entre_relances,
      max_relances_auto: champs.max_relances_auto,
      documents_requis_types: champs.documents_requis_types,
      description: champs.description,
      updated_at: new Date(),
    })
    .where(eq(templateEcheance.id, id));

  await db.insert(evenement).values({
    cabinet_id: auth.cabinet_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: auth.user_id,
    ressource_type: "calendar.template_echeance",
    ressource_id: id,
    description: `Modèle d'échéance modifié — ${champs.nom}`,
    metadata: { contexte: "template_echeance_modifie", nom: champs.nom },
  });

  revalidatePath(PATH);
  return { success: true };
}

// ─── Désactiver un template (soft state, scope cabinet strict) ────────────────

const desactiverSchema = z.object({ id: z.string().uuid() });

export async function desactiverTemplateEcheanceAction(
  _prev: TemplateEcheanceActionState,
  formData: FormData,
): Promise<TemplateEcheanceActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const parsed = desactiverSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Identifiant invalide." };
  const { id } = parsed.data;

  // Anti-fuite : même garde que la modification — jamais sur un global ou un
  // autre cabinet. eq(cabinet_id, auth.cabinet_id) exclut déjà les lignes
  // cabinet_id IS NULL (une comparaison SQL à NULL n'est jamais vraie).
  const [cible] = await db
    .select({ id: templateEcheance.id })
    .from(templateEcheance)
    .where(and(eq(templateEcheance.id, id), eq(templateEcheance.cabinet_id, auth.cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Template introuvable." };

  await db
    .update(templateEcheance)
    .set({ actif: false, updated_at: new Date() })
    .where(eq(templateEcheance.id, id));

  await db.insert(evenement).values({
    cabinet_id: auth.cabinet_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: auth.user_id,
    ressource_type: "calendar.template_echeance",
    ressource_id: id,
    description: "Modèle d'échéance désactivé",
    metadata: { contexte: "template_echeance_desactive" },
  });

  revalidatePath(PATH);
  return { success: true };
}
