"use server";

// Écran /parametres/conformite — server actions sur les demandes RGPD (crm.demande_
// suppression) : changement de statut + ajout de note. Sujet sensible (droit à l'oubli) :
// réservé au rôle responsable, comme /parametres/integrations. Aucune migration : les
// transitions se limitent aux 4 valeurs de statutDemandeSuppressionEnum posées en 0046
// (nouvelle/en_cours/traitee/rejetee). Pas de colonne notes sur la table (schéma scellé
// Bloc A côté cabinet_id, additif sinon mais non demandé ici) : les notes sont tracées
// dans crm.evenement (type "note_ajoutee" réutilisé, ressource_type "crm.demande_
// suppression") pour rester dans l'audit existant sans migration.
import { requireAuth } from "@zarya/auth";
import { db, demandeSuppression, evenement } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const PATH = "/app/parametres/conformite";

const STATUTS = ["nouvelle", "en_cours", "traitee", "rejetee"] as const;

export type ConformiteActionState = { error?: string; success?: boolean };

async function requireResponsable(): Promise<
  { cabinet_id: string; user_id: string } | { error: string }
> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = (user.app_metadata.role as string | undefined) ?? "collaborateur";
  if (role !== "responsable") {
    return { error: "Seul un responsable du cabinet peut traiter les demandes RGPD." };
  }
  return { cabinet_id, user_id: user.id };
}

const changerStatutSchema = z.object({
  demandeId: z.string().uuid(),
  statut: z.enum(STATUTS),
});

/** Change le statut d'une demande RGPD (scope cabinet + RBAC responsable). */
export async function changerStatutDemandeAction(
  _prev: ConformiteActionState,
  formData: FormData,
): Promise<ConformiteActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const parsed = changerStatutSchema.safeParse({
    demandeId: formData.get("demandeId"),
    statut: formData.get("statut"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const { demandeId, statut } = parsed.data;

  // Anti-fuite : la demande doit appartenir à ce cabinet ; on lit l'ancien statut pour l'audit.
  const [demande] = await db
    .select({ id: demandeSuppression.id, statut: demandeSuppression.statut })
    .from(demandeSuppression)
    .where(
      and(eq(demandeSuppression.id, demandeId), eq(demandeSuppression.cabinet_id, auth.cabinet_id)),
    )
    .limit(1);
  if (!demande) return { error: "Demande introuvable." };

  await db
    .update(demandeSuppression)
    .set({ statut, updated_at: new Date() })
    .where(eq(demandeSuppression.id, demandeId));

  await db.insert(evenement).values({
    cabinet_id: auth.cabinet_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: auth.user_id,
    ressource_type: "crm.demande_suppression",
    ressource_id: demandeId,
    description: `Demande RGPD — statut : ${demande.statut} → ${statut}`,
    metadata: {
      contexte: "demande_rgpd_statut",
      ancien_statut: demande.statut,
      nouveau_statut: statut,
    },
  });

  revalidatePath(PATH);
  return { success: true };
}

const ajouterNoteSchema = z.object({
  demandeId: z.string().uuid(),
  note: z.string().trim().min(1, "Note vide.").max(2000, "Note trop longue (2000 caractères max)."),
});

/** Ajoute une note libre sur une demande RGPD (tracée dans crm.evenement). */
export async function ajouterNoteDemandeAction(
  _prev: ConformiteActionState,
  formData: FormData,
): Promise<ConformiteActionState> {
  const auth = await requireResponsable();
  if ("error" in auth) return auth;

  const parsed = ajouterNoteSchema.safeParse({
    demandeId: formData.get("demandeId"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const { demandeId, note } = parsed.data;

  // Anti-fuite : la demande doit appartenir à ce cabinet.
  const [demande] = await db
    .select({ id: demandeSuppression.id })
    .from(demandeSuppression)
    .where(
      and(eq(demandeSuppression.id, demandeId), eq(demandeSuppression.cabinet_id, auth.cabinet_id)),
    )
    .limit(1);
  if (!demande) return { error: "Demande introuvable." };

  await db.insert(evenement).values({
    cabinet_id: auth.cabinet_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: auth.user_id,
    ressource_type: "crm.demande_suppression",
    ressource_id: demandeId,
    description: "Demande RGPD — note ajoutée",
    metadata: { contexte: "demande_rgpd_note", note },
  });

  revalidatePath(PATH);
  return { success: true };
}
