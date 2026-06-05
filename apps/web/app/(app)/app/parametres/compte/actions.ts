"use server";

// Run I1 — demande de suppression du compte CABINET (RGPD/nLPD, droits-personnes.md §4).
// Enregistre la demande (crm.demande_suppression cible='cabinet') ET passe le cabinet en
// statut 'archive' (soft-delete). L'effacement effectif (anonymisation PII, purge Vault,
// conservation audit 6 ans / comptable 10 ans) reste un process DPO hors application.
// RBAC : responsable uniquement. Anti-fuite : scope cabinet_id de l'acteur.
import { requireAuth } from "@zarya/auth";
import { cabinet, db, demandeSuppression, eq } from "@zarya/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const COMPTE_PATH = "/app/parametres/compte";

const schema = z.object({
  confirmation: z.string().trim().min(1),
  motif: z.string().trim().max(2000).optional(),
});

export type SuppressionCabinetState = { error?: string; success?: boolean };

export async function demanderSuppressionCabinetAction(
  _prev: SuppressionCabinetState,
  formData: FormData,
): Promise<SuppressionCabinetState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  const role = (user.app_metadata.role as string | undefined) ?? "collaborateur";
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (role !== "responsable") return { error: "Seul un responsable peut effectuer cette demande." };

  const parsed = schema.safeParse({
    confirmation: formData.get("confirmation"),
    motif: formData.get("motif") || undefined,
  });
  if (!parsed.success) return { error: "Formulaire invalide." };

  const [cab] = await db
    .select({ raison_sociale: cabinet.raison_sociale, statut: cabinet.statut })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);
  if (!cab) return { error: "Cabinet introuvable." };
  if (cab.statut === "archive") return { error: "Ce compte est déjà en cours de suppression." };
  // Confirmation forte : saisie exacte de la raison sociale.
  if (parsed.data.confirmation !== cab.raison_sociale) {
    return { error: "La confirmation ne correspond pas au nom du cabinet." };
  }

  await db.insert(demandeSuppression).values({
    cabinet_id,
    cible: "cabinet",
    demandeur_user_id: user.id,
    demandeur_email: user.email ?? null,
    motif: parsed.data.motif ?? null,
  });
  await db
    .update(cabinet)
    .set({ statut: "archive", archived_at: new Date(), updated_at: new Date() })
    .where(eq(cabinet.id, cabinet_id));

  revalidatePath(COMPTE_PATH);
  return { success: true };
}
