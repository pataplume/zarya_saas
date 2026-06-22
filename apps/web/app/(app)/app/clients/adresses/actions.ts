"use server";

import { requireAuth } from "@zarya/auth";
import { adresse, client, db, evenement } from "@zarya/db";
import { createAdresseSchema, supprimerAdresseSchema, updateAdresseSchema } from "@zarya/schemas";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Lot 1 (ADR 0025) — CRUD des adresses d'un client (crm.adresse).
// Mêmes garanties que les contacts : scope cabinet_id (anti-fuite), audit crm.evenement.
// Note enum (sceau Bloc A) : pas de type d'événement dédié « adresse » → `note_ajoutee`
// comme entrée de journal générique, sujet réel porté par ressource_type/description.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type AdresseActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

function bool(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "1";
}

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

// Au plus 1 adresse principale par client (index partiel uniq_adresse_principale_per_client).
async function unsetAutresPrincipales(
  cabinet_id: string,
  client_id: string,
  sauf_adresse_id: string | null,
): Promise<void> {
  const filtres = [
    eq(adresse.cabinet_id, cabinet_id),
    eq(adresse.client_id, client_id),
    eq(adresse.est_principale, true),
    isNull(adresse.archived_at),
  ];
  if (sauf_adresse_id) filtres.push(ne(adresse.id, sauf_adresse_id));
  await db
    .update(adresse)
    .set({ est_principale: false, updated_at: new Date() })
    .where(and(...filtres));
}

// ─── Créer une adresse ────────────────────────────────────────────────────────

export async function createAdresseAction(
  _prev: AdresseActionState,
  formData: FormData,
): Promise<AdresseActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = createAdresseSchema.safeParse({
    client_id: formData.get("client_id"),
    type: formData.get("type") ?? undefined,
    rue: optionnel(formData.get("rue")),
    complement: optionnel(formData.get("complement")),
    code_postal: optionnel(formData.get("code_postal")),
    ville: optionnel(formData.get("ville")),
    canton: optionnel(formData.get("canton")),
    pays: optionnel(formData.get("pays")),
    est_principale: bool(formData.get("est_principale")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { client_id, ...champs } = parsed.data;

  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  if (champs.est_principale) await unsetAutresPrincipales(cabinet_id, client_id, null);

  const [inserted] = await db
    .insert(adresse)
    .values({ cabinet_id, client_id, ...champs })
    .returning({ id: adresse.id });
  if (!inserted) return { error: "Création impossible" };

  await db.insert(evenement).values({
    cabinet_id,
    client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.adresse",
    ressource_id: inserted.id,
    description: `Adresse ajoutée (${champs.type})`,
  });

  revalidatePath(`/app/clients/${client_id}`);
  return { success: true };
}

// ─── Modifier une adresse ─────────────────────────────────────────────────────

export async function updateAdresseAction(
  _prev: AdresseActionState,
  formData: FormData,
): Promise<AdresseActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = updateAdresseSchema.safeParse({
    id: formData.get("id"),
    type: formData.get("type") ?? undefined,
    rue: optionnel(formData.get("rue")),
    complement: optionnel(formData.get("complement")),
    code_postal: optionnel(formData.get("code_postal")),
    ville: optionnel(formData.get("ville")),
    canton: optionnel(formData.get("canton")),
    pays: optionnel(formData.get("pays")),
    est_principale: bool(formData.get("est_principale")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id, ...champs } = parsed.data;

  const [existant] = await db
    .select({ id: adresse.id, client_id: adresse.client_id })
    .from(adresse)
    .where(and(eq(adresse.id, id), eq(adresse.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existant) return { error: "Adresse introuvable" };

  if (champs.est_principale) {
    await unsetAutresPrincipales(cabinet_id, existant.client_id, id);
  }

  await db
    .update(adresse)
    .set({ ...champs, updated_at: new Date() })
    .where(and(eq(adresse.id, id), eq(adresse.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existant.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.adresse",
    ressource_id: id,
    description: "Adresse modifiée",
    metadata: { champs: Object.keys(champs) },
  });

  revalidatePath(`/app/clients/${existant.client_id}`);
  return { success: true };
}

// ─── Supprimer (archiver) une adresse ─────────────────────────────────────────

export async function supprimerAdresseAction(
  _prev: AdresseActionState,
  formData: FormData,
): Promise<AdresseActionState> {
  const garde = await gardeEcriture();
  if ("error" in garde) return garde;
  const { cabinet_id, user_id } = garde;

  const parsed = supprimerAdresseSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const { id } = parsed.data;

  const [existant] = await db
    .select({ id: adresse.id, client_id: adresse.client_id })
    .from(adresse)
    .where(and(eq(adresse.id, id), eq(adresse.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existant) return { error: "Adresse introuvable" };

  await db
    .update(adresse)
    .set({ archived_at: new Date(), est_principale: false, updated_at: new Date() })
    .where(and(eq(adresse.id, id), eq(adresse.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existant.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user_id,
    ressource_type: "crm.adresse",
    ressource_id: id,
    description: "Adresse supprimée",
  });

  revalidatePath(`/app/clients/${existant.client_id}`);
  return { success: true };
}
