"use server";

import { requireAuth } from "@zarya/auth";
import { db, echeance } from "@zarya/db";
import { and, eq } from "drizzle-orm";
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
