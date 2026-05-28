"use server";

import { requireAuth } from "@zarya/auth";
import { client, db } from "@zarya/db";
import { createClientSchema, updateClientSchema } from "@zarya/schemas";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Rôles autorisés à créer/éditer un client (opérationnels).
// lecteur = lecture seule ; archivage réservé au responsable (cf. auth/CLAUDE.md).
const ROLES_ECRITURE = ["responsable", "gestionnaire_salaires", "collaborateur"];

export type ClientActionState = { error?: string; success?: boolean };

// Normalise une valeur de formulaire : "" → undefined (champ optionnel non rempli).
function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

// ─── Créer un client ──────────────────────────────────────────────────────────

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.includes(role)) {
    return { error: "Action non autorisée pour votre rôle" };
  }

  const parsed = createClientSchema.safeParse({
    raison_sociale: formData.get("raison_sociale"),
    ide: optionnel(formData.get("ide")),
    email_contact: optionnel(formData.get("email_contact")),
    statut: formData.get("statut") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const { raison_sociale, ide, email_contact, statut } = parsed.data;

  try {
    await db.insert(client).values({
      cabinet_id,
      raison_sociale,
      ide,
      email_contact,
      statut,
    });
  } catch (_err) {
    // uniq_client_ide_per_cabinet : IDE déjà utilisé dans ce cabinet
    return { error: "Un client avec cet IDE existe déjà dans votre cabinet" };
  }

  revalidatePath("/app/clients");
  return { success: true };
}

// ─── Modifier un client ───────────────────────────────────────────────────────

export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.includes(role)) {
    return { error: "Action non autorisée pour votre rôle" };
  }

  const parsed = updateClientSchema.safeParse({
    id: formData.get("id"),
    raison_sociale: optionnel(formData.get("raison_sociale")),
    ide: optionnel(formData.get("ide")),
    email_contact: optionnel(formData.get("email_contact")),
    statut: formData.get("statut") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const { id, ...champs } = parsed.data;

  try {
    await db
      .update(client)
      .set({ ...champs, updated_at: new Date() })
      .where(and(eq(client.id, id), eq(client.cabinet_id, cabinet_id)));
  } catch (_err) {
    return { error: "Un client avec cet IDE existe déjà dans votre cabinet" };
  }

  revalidatePath("/app/clients");
  return { success: true };
}

// ─── Archiver un client (soft delete, responsable uniquement) ─────────────────

export async function archiverClientAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return;

  const role = user.app_metadata.role as string | undefined;
  if (role !== "responsable") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(client)
    .set({ statut: "archive", archived_at: new Date(), updated_at: new Date() })
    .where(and(eq(client.id, id), eq(client.cabinet_id, cabinet_id)));

  revalidatePath("/app/clients");
}
