"use server";

import { requireAuth } from "@zarya/auth";
import {
  and,
  client,
  db,
  eq,
  evenement,
  relation,
  vaultCreateSecret,
  vaultUpdateSecret,
} from "@zarya/db";
import { isValidIban, masqueIban, normalizeIban } from "@zarya/extraction";
import { upsertRelationSchema } from "@zarya/schemas";
import { revalidatePath } from "next/cache";

// Lot 5 (ADR 0025 §6) — Section facturation du dossier client (crm.relation, 1-1 client).
// Honoraires / pack tarifaire / dates = NON sensibles, en clair. ⚠️ `iban_facturation` est
// ULTRA-SENSIBLE (ADR 0013) : chiffré au Vault (iban_facturation_vault_id) + masque d'affichage
// (iban_facturation_masque), jamais en clair.
//
// Sécurité : scope cabinet_id (anti-fuite), Zod, RBAC, audit.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type RelationActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

export async function upsertRelationAction(
  _prev: RelationActionState,
  formData: FormData,
): Promise<RelationActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = upsertRelationSchema.safeParse({
    client_id: formData.get("client_id"),
    pack_tarifaire: optionnel(formData.get("pack_tarifaire")),
    honoraires_mensuels: optionnel(formData.get("honoraires_mensuels")),
    honoraires_modele: optionnel(formData.get("honoraires_modele")),
    date_signature: optionnel(formData.get("date_signature")),
    date_renouvellement: optionnel(formData.get("date_renouvellement")),
    duree_engagement_mois: optionnel(formData.get("duree_engagement_mois")),
    notes_facturation: optionnel(formData.get("notes_facturation")),
    iban_facturation: optionnel(formData.get("iban_facturation")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const v = parsed.data;

  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, v.client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  if (!cli) return { error: "Client introuvable" };

  // Champs NON sensibles (en clair) — n'écrit que ceux fournis.
  const set: Record<string, unknown> = {};
  if (v.pack_tarifaire !== undefined) set.pack_tarifaire = v.pack_tarifaire;
  if (v.honoraires_mensuels !== undefined)
    set.honoraires_mensuels = v.honoraires_mensuels.toFixed(2);
  if (v.honoraires_modele !== undefined) set.honoraires_modele = v.honoraires_modele;
  if (v.date_signature !== undefined) set.date_signature = v.date_signature;
  if (v.date_renouvellement !== undefined) set.date_renouvellement = v.date_renouvellement;
  if (v.duree_engagement_mois !== undefined) set.duree_engagement_mois = v.duree_engagement_mois;
  if (v.notes_facturation !== undefined) set.notes_facturation = v.notes_facturation;

  // ⚠️ IBAN de facturation → Vault. Charge la ligne existante pour tourner le secret en place.
  let ibanMasque: string | null = null;
  if (v.iban_facturation !== undefined) {
    const iban = normalizeIban(v.iban_facturation);
    if (!isValidIban(iban)) return { error: "IBAN de facturation invalide (checksum mod-97)" };
    const [existing] = await db
      .select({ vault_id: relation.iban_facturation_vault_id })
      .from(relation)
      .where(and(eq(relation.client_id, v.client_id), eq(relation.cabinet_id, cabinet_id)))
      .limit(1);
    if (existing?.vault_id) {
      await vaultUpdateSecret(existing.vault_id, iban);
      set.iban_facturation_vault_id = existing.vault_id;
    } else {
      set.iban_facturation_vault_id = await vaultCreateSecret(
        iban,
        `crm/relation/iban_facturation/${v.client_id}/${Date.now()}`,
        `IBAN de facturation (cabinet ${cabinet_id})`,
      );
    }
    ibanMasque = masqueIban(iban);
    set.iban_facturation_masque = ibanMasque;
  }

  await db
    .insert(relation)
    .values({ client_id: v.client_id, cabinet_id, ...set })
    .onConflictDoUpdate({
      target: relation.client_id,
      set: { ...set, updated_at: new Date() },
    });

  await db.insert(evenement).values({
    cabinet_id,
    client_id: v.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.relation",
    ressource_id: v.client_id,
    description: "Conditions de facturation modifiées",
    metadata: {
      champs: Object.keys(set).filter((k) => k !== "iban_facturation_vault_id"),
      ...(ibanMasque ? { iban_facturation_masque: ibanMasque } : {}),
    },
  });

  revalidatePath(`/app/clients/${v.client_id}`);
  return { success: true };
}
