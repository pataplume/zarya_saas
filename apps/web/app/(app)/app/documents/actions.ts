"use server";

import { requireAuth } from "@zarya/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reprocessPendingDocuments } from "@/lib/reprocess-documents";

// Hub Documents — actions serveur. `reclasserDocumentAction` relance la classification d'un
// upload bloqué en 'recu' (classification jamais aboutie) en réutilisant l'OCR déjà stocké.
// AUTH + RBAC + scope cabinet ; le cœur vit dans lib/reprocess-documents (aussi appelé par cron).

const ROLES_UPLOAD = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ReclasserState = { success?: boolean; error?: string };

export async function reclasserDocumentAction(uploadBrutId: string): Promise<ReclasserState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_UPLOAD.has(role)) return { error: "Droits insuffisants." };
  if (!z.string().uuid().safeParse(uploadBrutId).success) return { error: "Identifiant invalide." };

  // Scope cabinet porté par le WHERE du cœur (anti-fuite, ADR 0005 addendum).
  const res = await reprocessPendingDocuments({ cabinet_id, upload_brut_id: uploadBrutId });
  revalidatePath("/app/documents");
  if (res.reclasses > 0) return { success: true };
  if (res.echecs > 0) return { error: "Le reclassement a échoué. Réessayez plus tard." };
  return { error: "Document déjà classé ou introuvable." };
}
