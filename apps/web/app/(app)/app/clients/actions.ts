"use server";

import { requireAuth } from "@zarya/auth";
import { adresse, cabinetMembre, client, db, evenement } from "@zarya/db";
import {
  createClientAvecZefixSchema,
  createClientSchema,
  updateClientSchema,
} from "@zarya/schemas";
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

// "" / absent → undefined ; sinon liste de tags dédupliquée (saisis séparés par virgule).
function parseTags(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const tags = value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? Array.from(new Set(tags)) : [];
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

// ─── Créer un client avec préremplissage Zefix (identité + adresse — Lot 3 ADR 0025) ──
//
// Corrige le bug ONB « Zefix ne remplit pas l'adresse » : la création standard du module
// client ne créait que crm.client (raison sociale + IDE), jamais l'adresse. Cette action crée
// crm.client (identité étendue) ET, si une adresse de siège est fournie (préremplie par Zefix
// côté UI via /api/zefix/*), la crm.adresse correspondante — le tout scopé cabinet_id, validé
// Zod, avec audit crm.evenement. Parcours NON BLOQUANT : tous les champs hors raison sociale
// sont optionnels (la recherche Zefix peut échouer → saisie manuelle, rien n'est imposé).

export type CreateClientZefixState = {
  error?: string;
  success?: boolean;
  client_id?: string;
};

export async function createClientDepuisZefixAction(
  _prev: CreateClientZefixState,
  formData: FormData,
): Promise<CreateClientZefixState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };

  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.includes(role)) {
    return { error: "Action non autorisée pour votre rôle" };
  }

  const parsed = createClientAvecZefixSchema.safeParse({
    raison_sociale: formData.get("raison_sociale"),
    ide: optionnel(formData.get("ide")),
    type: optionnel(formData.get("type")),
    forme_juridique: optionnel(formData.get("forme_juridique")),
    email_contact: optionnel(formData.get("email_contact")),
    statut: formData.get("statut") ?? undefined,
    adresse_rue: optionnel(formData.get("adresse_rue")),
    adresse_code_postal: optionnel(formData.get("adresse_code_postal")),
    adresse_ville: optionnel(formData.get("adresse_ville")),
    adresse_canton: optionnel(formData.get("adresse_canton")),
    adresse_pays: optionnel(formData.get("adresse_pays")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const v = parsed.data;

  let clientId: string;
  try {
    const [cli] = await db
      .insert(client)
      .values({
        cabinet_id,
        raison_sociale: v.raison_sociale,
        ide: v.ide,
        ...(v.type ? { type: v.type } : {}),
        ...(v.forme_juridique ? { forme_juridique: v.forme_juridique } : {}),
        email_contact: v.email_contact,
        statut: v.statut,
      })
      .returning({ id: client.id });
    if (!cli) return { error: "Échec de la création du client" };
    clientId = cli.id;
  } catch (_err) {
    // uniq_client_ide_per_cabinet : IDE déjà utilisé dans ce cabinet
    return { error: "Un client avec cet IDE existe déjà dans votre cabinet" };
  }

  // Adresse du siège : créée seulement si Zefix (ou l'utilisateur) a fourni rue OU ville.
  const aAdresse = !!v.adresse_rue || !!v.adresse_ville;
  if (aAdresse) {
    await db.insert(adresse).values({
      cabinet_id,
      client_id: clientId,
      type: "siege",
      rue: v.adresse_rue ?? null,
      code_postal: v.adresse_code_postal ?? null,
      ville: v.adresse_ville ?? null,
      canton: v.adresse_canton ?? null,
      pays: v.adresse_pays ?? "CH",
      est_principale: true,
    });
  }

  await db.insert(evenement).values({
    cabinet_id,
    client_id: clientId,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.client",
    ressource_id: clientId,
    description: "Client créé (préremplissage Zefix)",
    metadata: { avec_ide: !!v.ide, avec_adresse: aAdresse },
  });

  revalidatePath("/app/clients");
  return { success: true, client_id: clientId };
}

// ─── Modifier un client (identité étendue — Lot 1 ADR 0025) ───────────────────

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
    type: formData.get("type") ?? undefined,
    ide: optionnel(formData.get("ide")),
    numero_tva: optionnel(formData.get("numero_tva")),
    forme_juridique: optionnel(formData.get("forme_juridique")),
    langue: formData.get("langue") ?? undefined,
    responsable_id: optionnel(formData.get("responsable_id")),
    email_contact: optionnel(formData.get("email_contact")),
    statut: formData.get("statut") ?? undefined,
    tags: parseTags(formData.get("tags")),
    notes_commerciales: optionnel(formData.get("notes_commerciales")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const { id, responsable_id, ...champs } = parsed.data;

  // Garantie de scope : le client appartient bien au cabinet courant (anti-fuite).
  const [cible] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cible) return { error: "Client introuvable" };

  // Le gestionnaire référent doit être un membre du MÊME cabinet (cohérence + anti-fuite).
  if (responsable_id !== undefined) {
    const [membre] = await db
      .select({ id: cabinetMembre.id })
      .from(cabinetMembre)
      .where(and(eq(cabinetMembre.id, responsable_id), eq(cabinetMembre.cabinet_id, cabinet_id)))
      .limit(1);
    if (!membre) return { error: "Gestionnaire introuvable dans votre cabinet" };
  }

  try {
    await db
      .update(client)
      .set({
        ...champs,
        ...(responsable_id !== undefined ? { responsable_id } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(client.id, id), eq(client.cabinet_id, cabinet_id)));
  } catch (_err) {
    return { error: "Un client avec cet IDE existe déjà dans votre cabinet" };
  }

  await db.insert(evenement).values({
    cabinet_id,
    client_id: id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.client",
    ressource_id: id,
    description: "Fiche client modifiée",
    metadata: { champs: Object.keys(champs) },
  });

  revalidatePath("/app/clients");
  revalidatePath(`/app/clients/${id}`);
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
