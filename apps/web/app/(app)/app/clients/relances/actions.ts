"use server";

import { requireAuth } from "@zarya/auth";
import { type CibleRelance, creerBrouillonRelance, envoyerRelance } from "@zarya/calendar";
import { client as clientTable, db, evenement, pauseClient, relance } from "@zarya/db";
import { cibleRelanceSchema } from "@zarya/schemas";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMembreSignature } from "@/lib/membre-signature";

// Lot 4 (ADR 0025 §5 — Mode A) — relances documents depuis le dossier client.
//  - « Relancer » (client / échéance / document manquant) → crée un BROUILLON crm.relance.
//  - L'envoi via Microsoft Graph (sendCabinetEmailTracked) part UNIQUEMENT après validation
//    humaine explicite (confirmer-puis-envoyer), jamais en automatique.
//  - Pause des relances d'un client (calendar.pause_client).
// Tout est scopé cabinet_id (anti-fuite, car db service role bypasse la RLS), validé Zod,
// RBAC (lecteur = lecture seule), audité (crm.evenement).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type RelanceDocActionState = { error?: string; success?: boolean; relanceId?: string };
export type PauseActionState = { error?: string; success?: boolean };

async function garde(): Promise<{ cabinet_id: string; user_id: string } | { error: string }> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };
  return { cabinet_id, user_id: user.id };
}

/**
 * Crée un brouillon de relance pour une cible (échéance / document / client). NE PART PAS :
 * l'envoi est une action distincte confirmée par l'humain (Mode A).
 */
export async function creerRelanceAction(cible: CibleRelance): Promise<RelanceDocActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const parsed = cibleRelanceSchema.safeParse(cible);
  if (!parsed.success) return { error: "Cible de relance invalide." };

  const res = await creerBrouillonRelance(cabinet_id, parsed.data);

  if (res.status === "cible_introuvable") return { error: "Cible introuvable." };
  if (res.status === "sans_modele")
    return { error: "Aucun modèle de relance disponible pour ce type." };
  if (res.status === "deja_brouillon")
    return {
      error: "Un brouillon de relance existe déjà pour cette cible.",
      ...(res.relanceId ? { relanceId: res.relanceId } : {}),
    };

  // status === "cree" : on a forcément un relanceId (RETURNING id).
  const relanceId = res.relanceId;
  if (!relanceId) return { error: "Création du brouillon impossible." };

  // Tracer la création du brouillon (l'envoi a son propre événement).
  const [r] = await db
    .select({ client_id: relance.client_id })
    .from(relance)
    .where(and(eq(relance.id, relanceId), eq(relance.cabinet_id, cabinet_id)))
    .limit(1);
  if (r) {
    await db.insert(evenement).values({
      cabinet_id,
      client_id: r.client_id,
      type: "note_ajoutee",
      acteur_type: "cabinet_membre",
      acteur_id: user_id,
      ressource_type: "crm.relance",
      ressource_id: relanceId,
      description: "Brouillon de relance créé",
      metadata: { cible: parsed.data.kind },
    });
    revalidatePath(`/app/clients/${r.client_id}`);
  }

  return { success: true, relanceId };
}

/**
 * Envoie une relance en brouillon APRÈS validation humaine (confirmation côté UI).
 * Réutilise le pipeline tracé D5/C2b (draft+send + microsoft_message_id). Jamais d'auto-envoi.
 */
export async function envoyerRelanceDossierAction(
  relanceId: string,
): Promise<RelanceDocActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const idParsed = z.string().uuid().safeParse(relanceId);
  if (!idParsed.success) return { error: "Relance invalide." };

  const [row] = await db
    .select({ id: relance.id, statut: relance.statut, client_id: relance.client_id })
    .from(relance)
    .where(and(eq(relance.id, idParsed.data), eq(relance.cabinet_id, cabinet_id)))
    .limit(1);
  if (!row) return { error: "Relance introuvable." };
  if (row.statut !== "brouillon") return { error: "Relance déjà envoyée." };

  // Envoi tracé (draft+send) APRÈS validation humaine explicite (Mode A — ADR 0011 #5) :
  // l'appel ci-dessous bascule la relance brouillon→envoyee + stocke microsoft_message_id +
  // émet l'événement `relance_envoyee` (cf. @zarya/calendar envoyerRelance).
  const signature = await getMembreSignature(user_id, cabinet_id);
  const res = await envoyerRelance(idParsed.data, signature ? { signature } : {});

  revalidatePath(`/app/clients/${row.client_id}`);
  if (res.status === "envoyee") return { success: true };
  if (res.status === "revoked") return { error: "Reconnexion Microsoft requise." };
  if (res.status === "sans_destinataire")
    return { error: "Aucun destinataire pour cette relance." };
  return { error: "Échec de l'envoi." };
}

// ─── Pause des relances d'un client (calendar.pause_client) ───────────────────

const pauseSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date début invalide"),
  date_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date fin invalide"),
  motif: z.string().trim().max(200).optional(),
});

/** Met en pause les relances d'un client sur une période (vacances, surcharge). */
export async function pauserRelancesClientAction(
  _prev: PauseActionState,
  formData: FormData,
): Promise<PauseActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const m =
    typeof formData.get("motif") === "string" ? (formData.get("motif") as string).trim() : "";
  const parsed = pauseSchema.safeParse({
    client_id: formData.get("client_id"),
    date_debut: formData.get("date_debut"),
    date_fin: formData.get("date_fin"),
    motif: m.length > 0 ? m : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const v = parsed.data;
  if (v.date_fin < v.date_debut) return { error: "La date de fin précède la date de début." };

  const [cli] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, v.client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  await db.insert(pauseClient).values({
    cabinet_id,
    client_id: v.client_id,
    demande_par: user_id,
    date_debut: v.date_debut,
    date_fin: v.date_fin,
    motif: v.motif ?? null,
    actif: true,
  });

  await db.insert(evenement).values({
    cabinet_id,
    client_id: v.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "calendar.pause_client",
    description: `Relances en pause du ${v.date_debut} au ${v.date_fin}`,
  });

  revalidatePath(`/app/clients/${v.client_id}`);
  return { success: true };
}

/** Lève une pause active (anti-fuite : seulement les pauses du cabinet). */
export async function reprendreRelancesClientAction(pauseId: string): Promise<PauseActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const idParsed = z.string().uuid().safeParse(pauseId);
  if (!idParsed.success) return { error: "Pause invalide." };

  const updated = await db
    .update(pauseClient)
    .set({ actif: false, updated_at: new Date() })
    .where(and(eq(pauseClient.id, idParsed.data), eq(pauseClient.cabinet_id, cabinet_id)))
    .returning({ id: pauseClient.id, client_id: pauseClient.client_id });
  const row = updated[0];
  if (!row) return { error: "Pause introuvable." };

  await db.insert(evenement).values({
    cabinet_id,
    client_id: row.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "calendar.pause_client",
    ressource_id: row.id,
    description: "Reprise des relances",
  });

  revalidatePath(`/app/clients/${row.client_id}`);
  return { success: true };
}
