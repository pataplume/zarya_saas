"use server";

import { requireAuth } from "@zarya/auth";
import { client, contact, db, evenement } from "@zarya/db";
import { createContactSchema, supprimerContactSchema, updateContactSchema } from "@zarya/schemas";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Lot 1 (ADR 0025) — CRUD des contacts d'un client (crm.contact).
// Toute mutation est scopée cabinet_id (anti-fuite, le `db` service role bypasse la RLS) :
// on vérifie d'abord que le client / contact appartient au cabinet courant.
// Audit crm.evenement (journal) sur create/update/delete.
//
// Note enum (sceau Bloc A) : crm.type_evenement n'a pas de type dédié « contact modifié ».
// On réutilise `note_ajoutee` comme entrée de journal générique ; le sujet réel est porté
// par ressource_type/ressource_id + description (pas d'invention d'enum, ADR 0012).

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type ContactActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

function bool(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

// Garde commune : retourne le cabinet_id + l'id du membre (acteur), ou une erreur.
async function gardeEcriture(): Promise<
  { cabinet_id: string; user_id: string } | { error: string }
> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };
  return { cabinet_id, user_id: user.id };
}

// Au plus 1 contact principal par client (index partiel uniq_contact_principal_per_client).
// On désigne le nouveau principal en retirant le flag aux autres contacts actifs du client.
async function unsetAutresPrincipaux(
  cabinet_id: string,
  client_id: string,
  sauf_contact_id: string | null,
): Promise<void> {
  const filtres = [
    eq(contact.cabinet_id, cabinet_id),
    eq(contact.client_id, client_id),
    eq(contact.est_principal, true),
    isNull(contact.archived_at),
  ];
  if (sauf_contact_id) filtres.push(ne(contact.id, sauf_contact_id));
  await db
    .update(contact)
    .set({ est_principal: false, updated_at: new Date() })
    .where(and(...filtres));
}

// ─── Créer un contact ─────────────────────────────────────────────────────────

export async function createContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = createContactSchema.safeParse({
    client_id: formData.get("client_id"),
    nom: formData.get("nom"),
    prenom: optionnel(formData.get("prenom")),
    role: optionnel(formData.get("role")),
    est_principal: bool(formData.get("est_principal")),
    est_contact_rh: bool(formData.get("est_contact_rh")),
    est_signataire: bool(formData.get("est_signataire")),
    email: optionnel(formData.get("email")),
    telephone: optionnel(formData.get("telephone")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { client_id, ...champs } = parsed.data;

  // Scope : le client appartient au cabinet courant ?
  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  if (champs.est_principal) await unsetAutresPrincipaux(cabinet_id, client_id, null);

  const [inserted] = await db
    .insert(contact)
    .values({ cabinet_id, client_id, ...champs })
    .returning({ id: contact.id });
  if (!inserted) return { error: "Création impossible" };

  await db.insert(evenement).values({
    cabinet_id,
    client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.contact",
    ressource_id: inserted.id,
    description: `Contact ajouté : ${champs.prenom ? `${champs.prenom} ` : ""}${champs.nom}`,
  });

  revalidatePath(`/app/clients/${client_id}`);
  return { success: true };
}

// ─── Modifier un contact ──────────────────────────────────────────────────────

export async function updateContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = updateContactSchema.safeParse({
    id: formData.get("id"),
    nom: optionnel(formData.get("nom")),
    prenom: optionnel(formData.get("prenom")),
    role: optionnel(formData.get("role")),
    est_principal: bool(formData.get("est_principal")),
    est_contact_rh: bool(formData.get("est_contact_rh")),
    est_signataire: bool(formData.get("est_signataire")),
    email: optionnel(formData.get("email")),
    telephone: optionnel(formData.get("telephone")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id, ...champs } = parsed.data;

  // Scope : le contact existe-t-il dans ce cabinet ? (et son client, pour invalider le cache)
  const [existant] = await db
    .select({ id: contact.id, client_id: contact.client_id })
    .from(contact)
    .where(and(eq(contact.id, id), eq(contact.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existant) return { error: "Contact introuvable" };

  if (champs.est_principal) {
    await unsetAutresPrincipaux(cabinet_id, existant.client_id, id);
  }

  await db
    .update(contact)
    .set({ ...champs, updated_at: new Date() })
    .where(and(eq(contact.id, id), eq(contact.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existant.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.contact",
    ressource_id: id,
    description: "Contact modifié",
    metadata: { champs: Object.keys(champs) },
  });

  revalidatePath(`/app/clients/${existant.client_id}`);
  return { success: true };
}

// ─── Supprimer (archiver) un contact ──────────────────────────────────────────
// Soft delete (archived_at) : convention DB (pas de DELETE physique hors RGPD).

export async function supprimerContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = supprimerContactSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id } = parsed.data;

  const [existant] = await db
    .select({ id: contact.id, client_id: contact.client_id })
    .from(contact)
    .where(and(eq(contact.id, id), eq(contact.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existant) return { error: "Contact introuvable" };

  await db
    .update(contact)
    .set({ archived_at: new Date(), est_principal: false, updated_at: new Date() })
    .where(and(eq(contact.id, id), eq(contact.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existant.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.contact",
    ressource_id: id,
    description: "Contact supprimé",
  });

  revalidatePath(`/app/clients/${existant.client_id}`);
  return { success: true };
}
