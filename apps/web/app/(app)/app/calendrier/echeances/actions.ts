"use server";

import { requireAuth } from "@zarya/auth";
import { client, db, echeance, evenement } from "@zarya/db";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Vues échéances — module Calendar (calendar.md §6.2/§6.3, Bloc C3b). Transitions de
// statut déclenchées par l'humain : traiter / reporter / annuler. Auth + scope cabinet
// + RBAC (lecteur exclu) ; anti-fuite (WHERE cabinet_id discipliné — ADR 0005 addendum).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
const ECHEANCES_PATH = "/app/calendrier/echeances";

export type EcheanceActionState = { error?: string; success?: boolean };

function acteur(user: { app_metadata: Record<string, unknown> }) {
  return {
    cabinet_id: user.app_metadata.cabinet_id as string | undefined,
    role: (user.app_metadata.role as string | undefined) ?? "lecteur",
  };
}

async function transition(
  echeanceId: string,
  set: Record<string, unknown>,
): Promise<EcheanceActionState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const updated = await db
    .update(echeance)
    .set({ ...set, updated_at: new Date() })
    .where(and(eq(echeance.id, echeanceId), eq(echeance.cabinet_id, cabinet_id)))
    .returning({ id: echeance.id });
  if (updated.length === 0) return { error: "Échéance introuvable." };

  revalidatePath(ECHEANCES_PATH);
  return { success: true };
}

/** Marque l'échéance traitée (date du jour). */
export async function marquerTraiteeAction(echeanceId: string): Promise<EcheanceActionState> {
  return transition(echeanceId, {
    statut: "traitee",
    date_traitement: new Date().toISOString().slice(0, 10),
  });
}

/** Annule l'échéance. */
export async function annulerEcheanceAction(echeanceId: string): Promise<EcheanceActionState> {
  return transition(echeanceId, { statut: "annulee" });
}

// ─── Actions de lot ────────────────────────────────────────────────────────────────
// Même frontière que `transition` : auth + RBAC + re-vérification cabinet_id sur CHAQUE
// id via WHERE and(inArray(id, ids), eq(cabinet_id)) — un id d'un autre cabinet est
// silencieusement ignoré (anti-fuite, ADR 0005 addendum). Pas d'écriture crm.evenement
// (les actions unitaires n'en font pas non plus).

const lotSchema = z.array(z.string().uuid()).min(1).max(100);

export type EcheanceLotState = { traitees: number; error?: string };

async function transitionLot(
  echeanceIds: string[],
  set: Record<string, unknown>,
): Promise<EcheanceLotState> {
  const parsed = lotSchema.safeParse(echeanceIds);
  if (!parsed.success) return { traitees: 0, error: "Sélection invalide (1 à 100 échéances)." };

  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { traitees: 0, error: "Cabinet introuvable." };
  if (!ROLES_ECRITURE.has(role)) return { traitees: 0, error: "Droits insuffisants." };

  const updated = await db
    .update(echeance)
    .set({ ...set, updated_at: new Date() })
    .where(and(inArray(echeance.id, parsed.data), eq(echeance.cabinet_id, cabinet_id)))
    .returning({ id: echeance.id });
  if (updated.length === 0) return { traitees: 0, error: "Aucune échéance mise à jour." };

  revalidatePath(ECHEANCES_PATH);
  return { traitees: updated.length };
}

/** Marque un lot d'échéances traitées (date du jour). */
export async function marquerTraiteesLotAction(echeanceIds: string[]): Promise<EcheanceLotState> {
  return transitionLot(echeanceIds, {
    statut: "traitee",
    date_traitement: new Date().toISOString().slice(0, 10),
  });
}

/** Annule un lot d'échéances. */
export async function annulerLotAction(echeanceIds: string[]): Promise<EcheanceLotState> {
  return transitionLot(echeanceIds, { statut: "annulee" });
}

const reporterSchema = z.object({
  echeanceId: z.string().uuid(),
  reporteA: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (YYYY-MM-DD)"),
  motif: z.string().max(500).optional(),
});

/** Reporte l'échéance à une nouvelle date avec motif. */
export async function reporterEcheanceAction(formData: FormData): Promise<EcheanceActionState> {
  const parsed = reporterSchema.safeParse({
    echeanceId: formData.get("echeanceId"),
    reporteA: formData.get("reporteA"),
    motif: formData.get("motif") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  return transition(parsed.data.echeanceId, {
    statut: "reportee",
    reporte_a: parsed.data.reporteA,
    motif_report: parsed.data.motif ?? null,
  });
}

// ─── Création manuelle (RUN4 usabilité) ────────────────────────────────────────────
// `crm.echeance` n'avait jusqu'ici aucune voie de création hors génération auto. Le
// type `personnalisee` existe déjà dans typeEcheanceEnum — aucune migration requise.

const creerEcheanceSchema = z.object({
  client_id: z.string().uuid(),
  libelle: z.string().trim().min(1, "Libellé requis").max(200),
  date_echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'échéance requise (AAAA-MM-JJ)"),
  date_alerte: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine(
      (v) => v === null || v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v),
      "Date d'alerte invalide",
    ),
});

/** Crée une échéance personnalisée (RUN4 usabilité) — le type `personnalisee` existe déjà. */
export async function creerEcheanceManuelleAction(
  _prev: EcheanceActionState,
  formData: FormData,
): Promise<EcheanceActionState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };

  const parsed = creerEcheanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const v = parsed.data;

  // Anti-fuite : le client doit appartenir à ce cabinet.
  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, v.client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  const [nouvelle] = await db
    .insert(echeance)
    .values({
      cabinet_id,
      client_id: v.client_id,
      type: "personnalisee",
      libelle: v.libelle,
      date_echeance: v.date_echeance,
      date_alerte: v.date_alerte ?? null,
    })
    .returning({ id: echeance.id });
  if (!nouvelle) return { error: "Échec de la création." };

  await db.insert(evenement).values({
    cabinet_id,
    client_id: v.client_id,
    type: "echeance_creee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.echeance",
    ressource_id: nouvelle.id,
    description: `Échéance créée manuellement : ${v.libelle}`,
    metadata: { libelle: v.libelle, date_echeance: v.date_echeance },
  });

  revalidatePath(ECHEANCES_PATH);
  return { success: true };
}
