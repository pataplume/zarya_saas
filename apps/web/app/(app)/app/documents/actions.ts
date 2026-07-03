"use server";

import { requireAuth } from "@zarya/auth";
import { and, db, document, eq, evenement, facture, isNull } from "@zarya/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reprocessPendingDocuments } from "@/lib/reprocess-documents";

// Hub Documents — actions serveur. `reclasserDocumentAction` relance la classification d'un
// upload bloqué en 'recu' (classification jamais aboutie) en réutilisant l'OCR déjà stocké.
// `archiverDocumentAction` (RUN 3) soft-delete un document validé mal classé / en double.
// AUTH + RBAC + scope cabinet ; le cœur de reclassement vit dans lib/reprocess-documents.

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

// ─── RUN 3 — Cycle de vie documentaire : archivage (soft-delete) ──────────────
// Retire des listes un document validé mal classé ou en double (`doc.document.archived_at`).
// Soft-delete uniquement (ADR 0013 / conventions db) — jamais de DELETE physique.
// GARDE-FOU : un document ayant produit une facture finalisée (facture.facture.document_id)
// ne peut pas être archivé — il faut d'abord traiter/supprimer la facture (intégrité comptable).

export type ArchiverDocumentState = { success?: boolean; error?: string };

export async function archiverDocumentAction(documentId: string): Promise<ArchiverDocumentState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  if (!ROLES_UPLOAD.has(role)) return { error: "Droits insuffisants." };
  if (!z.string().uuid().safeParse(documentId).success) return { error: "Identifiant invalide." };

  // Porte de sécurité : le document doit appartenir au cabinet et ne pas être déjà archivé.
  // Scope cabinet_id explicite (le db service-role bypasse la RLS — ADR 0005 addendum).
  const [doc] = await db
    .select({ id: document.id, client_id: document.client_id, libelle: document.libelle })
    .from(document)
    .where(
      and(
        eq(document.id, documentId),
        eq(document.cabinet_id, cabinet_id),
        isNull(document.archived_at),
      ),
    )
    .limit(1);
  if (!doc) return { error: "Document introuvable ou déjà archivé." };

  // Garde-fou : refuser si une facture finale a été produite depuis ce document (scopée cabinet).
  const [factureLiee] = await db
    .select({ id: facture.id })
    .from(facture)
    .where(
      and(
        eq(facture.document_id, documentId),
        eq(facture.cabinet_id, cabinet_id),
        isNull(facture.archived_at),
      ),
    )
    .limit(1);
  if (factureLiee) {
    return {
      error: "Ce document a produit une facture — traitez ou supprimez d'abord la facture.",
    };
  }

  const now = new Date();
  await db
    .update(document)
    .set({ archived_at: now, updated_at: now })
    .where(and(eq(document.id, documentId), eq(document.cabinet_id, cabinet_id)));

  // Journal (crm.evenement) — pas de type dédié « document archivé » dans l'enum scellé (Bloc A),
  // on réutilise `note_ajoutee` comme entrée générique (même convention que les mutations clients).
  await db.insert(evenement).values({
    cabinet_id,
    client_id: doc.client_id ?? null,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "doc.document",
    ressource_id: doc.id,
    description: "Document archivé",
    metadata: { libelle: doc.libelle },
  });

  revalidatePath("/app/documents");
  revalidatePath(`/app/documents/${documentId}`);
  if (doc.client_id) revalidatePath(`/app/clients/${doc.client_id}`);
  return { success: true };
}
