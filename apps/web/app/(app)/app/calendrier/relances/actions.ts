"use server";

import { requireAuth } from "@zarya/auth";
import { envoyerRelance, envoyerRelancesValidees } from "@zarya/calendar";
import { db, relance } from "@zarya/db";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMembreSignature } from "@/lib/membre-signature";

// File des relances à valider — module Calendar (calendar.md §6.4, Bloc C3a).
// Mode A : l'humain valide puis envoie. L'envoi réel (draft+send + tracking) vit dans
// @zarya/calendar (C2b) ; ces server actions ajoutent l'AUTH + le SCOPE cabinet + le RBAC.
// Anti-fuite : toute action re-vérifie que la relance appartient au cabinet de l'acteur
// (frontière de sécurité réelle sur le chemin service-role — ADR 0005 addendum).

const ROLES_VALIDATION = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
const RELANCES_PATH = "/app/calendrier/relances";

export type RelanceActionState = { error?: string; success?: boolean };
export type RelanceLotState = {
  error?: string;
  envoyees?: number;
  echecs?: number;
  ignores?: number;
};

function acteur(user: { app_metadata: Record<string, unknown> }) {
  return {
    cabinet_id: user.app_metadata.cabinet_id as string | undefined,
    role: (user.app_metadata.role as string | undefined) ?? "lecteur",
  };
}

/** Envoie une relance en brouillon (1-clic). */
export async function envoyerRelanceAction(relanceId: string): Promise<RelanceActionState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const [row] = await db
    .select({ id: relance.id, statut: relance.statut })
    .from(relance)
    .where(and(eq(relance.id, relanceId), eq(relance.cabinet_id, cabinet_id)))
    .limit(1);
  if (!row) return { error: "Relance introuvable." };
  if (row.statut !== "brouillon") return { error: "Relance déjà envoyée." };

  const signature = await getMembreSignature(user.id, cabinet_id);
  const res = await envoyerRelance(relanceId, signature ? { signature } : {});
  revalidatePath(RELANCES_PATH);
  if (res.status === "envoyee") return { success: true };
  if (res.status === "revoked") return { error: "Reconnexion Microsoft requise." };
  if (res.status === "sans_destinataire")
    return { error: "Aucun destinataire pour cette relance." };
  return { error: "Échec de l'envoi." };
}

/** Envoie un lot de relances sélectionnées (anti-fuite : seules celles du cabinet). */
export async function envoyerLotAction(relanceIds: string[]): Promise<RelanceLotState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };
  if (relanceIds.length === 0) return { envoyees: 0, echecs: 0, ignores: 0 };

  const owned = await db
    .select({ id: relance.id })
    .from(relance)
    .where(
      and(
        inArray(relance.id, relanceIds),
        eq(relance.cabinet_id, cabinet_id),
        eq(relance.statut, "brouillon"),
      ),
    );
  const ids = owned.map((o) => o.id);
  const signature = await getMembreSignature(user.id, cabinet_id);
  const res = await envoyerRelancesValidees(ids, signature ? { signature } : {});
  revalidatePath(RELANCES_PATH);
  return {
    envoyees: res.envoyees,
    echecs: res.echecs,
    ignores: relanceIds.length - ids.length,
  };
}

const modifierSchema = z.object({
  relanceId: z.string().uuid(),
  sujet: z.string().min(1).max(998),
  corps: z.string().min(1).max(20000),
});

/** Corrige le sujet/corps d'une relance en brouillon avant envoi. */
export async function modifierRelanceAction(formData: FormData): Promise<RelanceActionState> {
  const { cabinet_id, role } = acteur(await requireAuth());
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const parsed = modifierSchema.safeParse({
    relanceId: formData.get("relanceId"),
    sujet: formData.get("sujet"),
    corps: formData.get("corps"),
  });
  if (!parsed.success) return { error: "Champs invalides." };

  const updated = await db
    .update(relance)
    .set({ sujet: parsed.data.sujet, corps: parsed.data.corps, updated_at: new Date() })
    .where(
      and(
        eq(relance.id, parsed.data.relanceId),
        eq(relance.cabinet_id, cabinet_id),
        eq(relance.statut, "brouillon"),
      ),
    )
    .returning({ id: relance.id });
  if (updated.length === 0) return { error: "Relance introuvable ou déjà envoyée." };

  revalidatePath(RELANCES_PATH);
  return { success: true };
}
