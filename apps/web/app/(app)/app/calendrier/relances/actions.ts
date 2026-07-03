"use server";

import { requireAuth } from "@zarya/auth";
import {
  envoyerRelance,
  envoyerRelancesValidees,
  escaladerRelances,
  genererBrouillonsRelances,
} from "@zarya/calendar";
import { db, evenement, relance, sql } from "@zarya/db";
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

// Déclenchement manuel de la génération (RUN5 usabilité, arbitrage A8) : le cabinet peut
// forcer une passe de génération des brouillons (au lieu d'attendre le cron `generer-relances`,
// toutes les 5h). Confirmation côté UI + cooldown 1h côté serveur (anti-spam si le cabinet
// doute que le cron ait tourné). Le cooldown est tracé via `crm.evenement` (pas de nouvelle
// table) : même convention que l'archivage de document (RUN3) — on réutilise `note_ajoutee`
// avec un `metadata` distinctif, `crm.evenement.type` faisant partie du schéma scellé (Bloc A).
const COOLDOWN_GENERATION_MS = 60 * 60 * 1000;
const ACTION_GENERATION_MANUELLE = "generation_manuelle_relances";

export type RelanceActionState = { error?: string; success?: boolean };
export type RelanceLotState = {
  error?: string;
  envoyees?: number;
  echecs?: number;
  ignores?: number;
};
export type GenererRelancesManuelState = {
  error?: string;
  success?: boolean;
  brouillonsCrees?: number;
  candidats?: number;
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

/** Formatte le temps restant avant la fin du cooldown, arrondi à la minute (min 1). */
function formatTempsRestant(depuisMs: number): string {
  const restantMs = COOLDOWN_GENERATION_MS - depuisMs;
  const totalMinutes = Math.max(1, Math.round(restantMs / 60_000));
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (heures === 0) return `${minutes}min`;
  if (minutes === 0) return `${heures}h`;
  return `${heures}h ${minutes}min`;
}

/**
 * Déclenche manuellement une passe de génération des brouillons de relance pour le cabinet
 * de l'acteur (même logique que le cron `generer-relances`, scopée à un seul cabinet) :
 * `genererBrouillonsRelances` (n°1) puis `escaladerRelances` (n°2+), dans le même ordre.
 * Ne crée QUE des brouillons — jamais d'envoi (l'envoi reste la file de validation existante).
 * Cooldown 1h par cabinet (arbitrage A8), tracé via `crm.evenement`.
 */
export async function genererRelancesManuelAction(): Promise<GenererRelancesManuelState> {
  const user = await requireAuth();
  const { cabinet_id, role } = acteur(user);
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_VALIDATION.has(role)) return { error: "Droits insuffisants." };

  const [dernier] = await db.execute<{ created_at: Date }>(sql`
    SELECT created_at FROM crm.evenement
    WHERE cabinet_id = ${cabinet_id}::uuid
      AND type = 'note_ajoutee'
      AND metadata->>'action' = ${ACTION_GENERATION_MANUELLE}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (dernier) {
    const depuisMs = Date.now() - new Date(dernier.created_at).getTime();
    if (depuisMs < COOLDOWN_GENERATION_MS) {
      return {
        error: `Génération déjà lancée récemment — réessayez dans ${formatTempsRestant(depuisMs)}.`,
      };
    }
  }

  const generation = await genererBrouillonsRelances({ cabinetId: cabinet_id });
  const escalade = await escaladerRelances({ cabinetId: cabinet_id });
  const brouillonsCrees = generation.brouillons_crees + escalade.brouillons_crees;
  const candidats = generation.candidats + escalade.candidats;

  await db.insert(evenement).values({
    cabinet_id,
    client_id: null,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.relance",
    description: "Génération manuelle des relances déclenchée",
    metadata: { action: ACTION_GENERATION_MANUELLE, brouillons_crees: brouillonsCrees, candidats },
  });

  revalidatePath(RELANCES_PATH);
  return { success: true, brouillonsCrees, candidats };
}
