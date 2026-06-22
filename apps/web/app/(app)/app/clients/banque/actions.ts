"use server";

import { requireAuth } from "@zarya/auth";
import {
  and,
  banque,
  client,
  db,
  eq,
  evenement,
  vaultCreateSecret,
  vaultDeleteSecret,
  vaultUpdateSecret,
} from "@zarya/db";
import { isValidIban, masqueIban, normalizeIban } from "@zarya/extraction";
import { createBanqueSchema, supprimerBanqueSchema, updateBanqueSchema } from "@zarya/schemas";
import { revalidatePath } from "next/cache";

// Lot 5 (ADR 0025 §6) — Section bancaire du dossier client (crm.banque).
// ⚠️ SCEAU ANTI-CLAIR (ADR 0013) : l'IBAN et les credentials Open Banking ne sont JAMAIS
// stockés en clair. Ils sont chiffrés au Vault (vaultCreateSecret) ; la table ne porte que
// l'UUID du secret (iban_vault_id / credentials_open_banking_vault_id) + un masque d'affichage
// (iban_masque = 4 derniers caractères, non sensible).
//
// Sécurité : scope cabinet_id (anti-fuite, db service role bypasse la RLS), Zod, RBAC, audit.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

export type BanqueActionState = { error?: string; success?: boolean };

function optionnel(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}

/** Vérifie que le client appartient bien au cabinet (frontière de sécurité réelle). */
async function clientDuCabinet(client_id: string, cabinet_id: string): Promise<boolean> {
  const [cli] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, client_id), eq(client.cabinet_id, cabinet_id)))
    .limit(1);
  return Boolean(cli);
}

export async function createBanqueAction(
  _prev: BanqueActionState,
  formData: FormData,
): Promise<BanqueActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = createBanqueSchema.safeParse({
    client_id: formData.get("client_id"),
    nom_banque: optionnel(formData.get("nom_banque")),
    iban: formData.get("iban"),
    bic: optionnel(formData.get("bic")),
    devise: optionnel(formData.get("devise")),
    usage: optionnel(formData.get("usage")),
    credentials_open_banking: optionnel(formData.get("credentials_open_banking")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const v = parsed.data;

  if (!(await clientDuCabinet(v.client_id, cabinet_id))) return { error: "Client introuvable" };

  // Re-vérification du checksum mod-97 (le schéma ne valide que le format).
  const iban = normalizeIban(v.iban);
  if (!isValidIban(iban)) return { error: "IBAN invalide (checksum mod-97)" };

  // Chiffrement au Vault — jamais d'IBAN/credentials en clair au repos.
  const ibanVaultId = await vaultCreateSecret(
    iban,
    `crm/banque/iban/${v.client_id}/${Date.now()}`,
    `IBAN compte bancaire client (cabinet ${cabinet_id})`,
  );
  let credsVaultId: string | null = null;
  if (v.credentials_open_banking) {
    credsVaultId = await vaultCreateSecret(
      v.credentials_open_banking,
      `crm/banque/open_banking/${v.client_id}/${Date.now()}`,
      `Credentials Open Banking (cabinet ${cabinet_id})`,
    );
  }

  const [row] = await db
    .insert(banque)
    .values({
      cabinet_id,
      client_id: v.client_id,
      nom_banque: v.nom_banque ?? null,
      iban_vault_id: ibanVaultId,
      iban_masque: masqueIban(iban),
      bic: v.bic ?? null,
      ...(v.devise ? { devise: v.devise } : {}),
      usage: v.usage ?? null,
      credentials_open_banking_vault_id: credsVaultId,
    })
    .returning({ id: banque.id });

  await db.insert(evenement).values({
    cabinet_id,
    client_id: v.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.banque",
    ressource_id: row?.id ?? null,
    description: "Compte bancaire ajouté",
    metadata: { usage: v.usage ?? null, iban_masque: masqueIban(iban) },
  });

  revalidatePath(`/app/clients/${v.client_id}`);
  return { success: true };
}

export async function updateBanqueAction(
  _prev: BanqueActionState,
  formData: FormData,
): Promise<BanqueActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = updateBanqueSchema.safeParse({
    id: formData.get("id"),
    nom_banque: optionnel(formData.get("nom_banque")),
    iban: optionnel(formData.get("iban")),
    bic: optionnel(formData.get("bic")),
    devise: optionnel(formData.get("devise")),
    usage: optionnel(formData.get("usage")),
    actif: formData.get("actif") === "true" ? true : undefined,
    credentials_open_banking: optionnel(formData.get("credentials_open_banking")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  const v = parsed.data;

  // Charge la ligne scopée cabinet (anti-fuite) + ses UUID de secrets existants.
  const [existing] = await db
    .select({
      id: banque.id,
      client_id: banque.client_id,
      iban_vault_id: banque.iban_vault_id,
      credentials_open_banking_vault_id: banque.credentials_open_banking_vault_id,
    })
    .from(banque)
    .where(and(eq(banque.id, v.id), eq(banque.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existing) return { error: "Compte introuvable" };

  const set: Record<string, unknown> = { updated_at: new Date() };
  if (v.nom_banque !== undefined) set.nom_banque = v.nom_banque;
  if (v.bic !== undefined) set.bic = v.bic;
  if (v.devise !== undefined) set.devise = v.devise;
  if (v.usage !== undefined) set.usage = v.usage;
  if (v.actif !== undefined) set.actif = v.actif;

  // IBAN fourni : on tourne le secret Vault (même UUID si présent, sinon création) + masque.
  if (v.iban !== undefined) {
    const iban = normalizeIban(v.iban);
    if (!isValidIban(iban)) return { error: "IBAN invalide (checksum mod-97)" };
    if (existing.iban_vault_id) {
      await vaultUpdateSecret(existing.iban_vault_id, iban);
    } else {
      set.iban_vault_id = await vaultCreateSecret(
        iban,
        `crm/banque/iban/${existing.client_id}/${Date.now()}`,
        `IBAN compte bancaire client (cabinet ${cabinet_id})`,
      );
    }
    set.iban_masque = masqueIban(iban);
  }

  // Credentials Open Banking fournis : rotation/création au Vault.
  if (v.credentials_open_banking !== undefined) {
    if (existing.credentials_open_banking_vault_id) {
      await vaultUpdateSecret(
        existing.credentials_open_banking_vault_id,
        v.credentials_open_banking,
      );
    } else {
      set.credentials_open_banking_vault_id = await vaultCreateSecret(
        v.credentials_open_banking,
        `crm/banque/open_banking/${existing.client_id}/${Date.now()}`,
        `Credentials Open Banking (cabinet ${cabinet_id})`,
      );
    }
  }

  await db
    .update(banque)
    .set(set)
    .where(and(eq(banque.id, v.id), eq(banque.cabinet_id, cabinet_id)));

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existing.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.banque",
    ressource_id: v.id,
    description: "Compte bancaire modifié",
    metadata: { champs: Object.keys(set).filter((k) => k !== "updated_at") },
  });

  revalidatePath(`/app/clients/${existing.client_id}`);
  return { success: true };
}

export async function supprimerBanqueAction(
  _prev: BanqueActionState,
  formData: FormData,
): Promise<BanqueActionState> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet non configuré" };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Action non autorisée pour votre rôle" };

  const parsed = supprimerBanqueSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Compte invalide" };

  const [existing] = await db
    .select({
      id: banque.id,
      client_id: banque.client_id,
      iban_vault_id: banque.iban_vault_id,
      credentials_open_banking_vault_id: banque.credentials_open_banking_vault_id,
    })
    .from(banque)
    .where(and(eq(banque.id, parsed.data.id), eq(banque.cabinet_id, cabinet_id)))
    .limit(1);
  if (!existing) return { error: "Compte introuvable" };

  // Soft-delete de la ligne métier + purge des secrets Vault (pas de matériel orphelin).
  await db
    .update(banque)
    .set({ archived_at: new Date(), actif: false, updated_at: new Date() })
    .where(and(eq(banque.id, parsed.data.id), eq(banque.cabinet_id, cabinet_id)));

  if (existing.iban_vault_id) await vaultDeleteSecret(existing.iban_vault_id);
  if (existing.credentials_open_banking_vault_id)
    await vaultDeleteSecret(existing.credentials_open_banking_vault_id);

  await db.insert(evenement).values({
    cabinet_id,
    client_id: existing.client_id,
    type: "note_ajoutee",
    acteur_type: "cabinet_membre",
    acteur_id: user.id,
    ressource_type: "crm.banque",
    ressource_id: parsed.data.id,
    description: "Compte bancaire archivé",
    metadata: null,
  });

  revalidatePath(`/app/clients/${existing.client_id}`);
  return { success: true };
}
