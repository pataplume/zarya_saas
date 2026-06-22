"use server";

import { requireAuth } from "@zarya/auth";
import { client as clientTable, db, documentAttendu, evenement, service } from "@zarya/db";
import {
  createDocumentAttenduSchema,
  supprimerDocumentAttenduSchema,
  updateDocumentAttenduSchema,
} from "@zarya/schemas";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Lot 4 (ADR 0025) — CRUD crm.document_attendu (documents périodiques attendus d'un client).
// Chaque mutation : scope cabinet_id (anti-fuite, car db service role bypasse la RLS),
// validée Zod, RBAC (lecteur = lecture seule), audit crm.evenement. Aucune table métier
// nouvelle (crm.document_attendu déjà au registre METIER_TABLES). Aucun champ sensible.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type DocumentAttenduActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

function bool(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

function entier(value: FormDataEntryValue | null): number | undefined {
  const s = optionnel(value);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN; // NaN → rejeté par Zod (int)
}

async function garde(): Promise<{ cabinet_id: string; user_id: string } | { error: string }> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };
  return { cabinet_id, user_id: user.id };
}

/** Vérifie qu'un service appartient bien au client+cabinet (sinon FK fantôme cross-tenant). */
async function serviceAppartient(
  cabinet_id: string,
  client_id: string,
  service_id: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: service.id })
    .from(service)
    .where(
      and(
        eq(service.id, service_id),
        eq(service.cabinet_id, cabinet_id),
        eq(service.client_id, client_id),
      ),
    )
    .limit(1);
  return !!row;
}

export async function createDocumentAttenduAction(
  _prev: DocumentAttenduActionState,
  formData: FormData,
): Promise<DocumentAttenduActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const parsed = createDocumentAttenduSchema.safeParse({
    client_id: formData.get("client_id"),
    service_id: optionnel(formData.get("service_id")),
    type_document: optionnel(formData.get("type_document")),
    categorie: optionnel(formData.get("categorie")),
    frequence: optionnel(formData.get("frequence")),
    obligatoire:
      formData.get("obligatoire") == null ? undefined : bool(formData.get("obligatoire")),
    deadline_jours_apres_periode: entier(formData.get("deadline_jours_apres_periode")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const v = parsed.data;

  const [cli] = await db
    .select({ id: clientTable.id })
    .from(clientTable)
    .where(and(eq(clientTable.id, v.client_id), eq(clientTable.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable." };

  if (v.service_id && !(await serviceAppartient(cabinet_id, v.client_id, v.service_id))) {
    return { error: "Service introuvable pour ce client." };
  }

  const [inserted] = await db
    .insert(documentAttendu)
    .values({
      cabinet_id,
      client_id: v.client_id,
      service_id: v.service_id ?? null,
      type_document: v.type_document,
      categorie: v.categorie ?? null,
      frequence: v.frequence,
      obligatoire: v.obligatoire ?? true,
      deadline_jours_apres_periode: v.deadline_jours_apres_periode ?? null,
      actif: true,
    })
    .returning({ id: documentAttendu.id });

  await db.insert(evenement).values({
    cabinet_id,
    client_id: v.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.document_attendu",
    ressource_id: inserted?.id,
    description: `Document attendu ajouté : ${v.type_document}`,
    metadata: { frequence: v.frequence, obligatoire: v.obligatoire ?? true },
  });

  revalidatePath(`/app/clients/${v.client_id}`);
  return { success: true };
}

export async function updateDocumentAttenduAction(
  _prev: DocumentAttenduActionState,
  formData: FormData,
): Promise<DocumentAttenduActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  // service_id : "" → mise à NULL (détacher) ; absent → inchangé.
  const serviceRaw = formData.get("service_id");
  const serviceId =
    serviceRaw == null
      ? undefined
      : optionnel(serviceRaw) === undefined
        ? null
        : optionnel(serviceRaw);
  const deadlineRaw = formData.get("deadline_jours_apres_periode");
  const deadline =
    deadlineRaw == null
      ? undefined
      : optionnel(deadlineRaw) === undefined
        ? null
        : entier(deadlineRaw);

  const parsed = updateDocumentAttenduSchema.safeParse({
    id: formData.get("id"),
    service_id: serviceId,
    type_document: optionnel(formData.get("type_document")),
    categorie: optionnel(formData.get("categorie")),
    frequence: optionnel(formData.get("frequence")),
    obligatoire:
      formData.get("obligatoire") == null ? undefined : bool(formData.get("obligatoire")),
    deadline_jours_apres_periode: deadline,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const v = parsed.data;

  const [cible] = await db
    .select({ id: documentAttendu.id, client_id: documentAttendu.client_id })
    .from(documentAttendu)
    .where(and(eq(documentAttendu.id, v.id), eq(documentAttendu.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Document introuvable." };

  if (
    v.service_id != null &&
    !(await serviceAppartient(cabinet_id, cible.client_id, v.service_id))
  ) {
    return { error: "Service introuvable pour ce client." };
  }

  await db
    .update(documentAttendu)
    .set({
      ...(v.service_id !== undefined ? { service_id: v.service_id } : {}),
      ...(v.type_document !== undefined ? { type_document: v.type_document } : {}),
      ...(v.categorie !== undefined ? { categorie: v.categorie } : {}),
      ...(v.frequence !== undefined ? { frequence: v.frequence } : {}),
      ...(v.obligatoire !== undefined ? { obligatoire: v.obligatoire } : {}),
      ...(v.deadline_jours_apres_periode !== undefined
        ? { deadline_jours_apres_periode: v.deadline_jours_apres_periode }
        : {}),
      updated_at: new Date(),
    })
    .where(and(eq(documentAttendu.id, v.id), eq(documentAttendu.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: cible.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.document_attendu",
    ressource_id: cible.id,
    description: "Document attendu modifié",
  });

  revalidatePath(`/app/clients/${cible.client_id}`);
  return { success: true };
}

export async function supprimerDocumentAttenduAction(
  _prev: DocumentAttenduActionState,
  formData: FormData,
): Promise<DocumentAttenduActionState> {
  const g = await garde();
  if ("error" in g) return g;
  const { cabinet_id, user_id } = g;

  const parsed = supprimerDocumentAttenduSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const [cible] = await db
    .select({ id: documentAttendu.id, client_id: documentAttendu.client_id })
    .from(documentAttendu)
    .where(and(eq(documentAttendu.id, parsed.data.id), eq(documentAttendu.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Document introuvable." };

  // Soft-delete (archived_at + actif=false) — pas de DELETE physique (convention DB).
  await db
    .update(documentAttendu)
    .set({ actif: false, archived_at: new Date(), updated_at: new Date() })
    .where(and(eq(documentAttendu.id, parsed.data.id), eq(documentAttendu.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: cible.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.document_attendu",
    ressource_id: cible.id,
    description: "Document attendu retiré",
  });

  revalidatePath(`/app/clients/${cible.client_id}`);
  return { success: true };
}
