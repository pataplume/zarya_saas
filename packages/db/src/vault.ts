// Wrappers Supabase Vault — chiffrement au repos des secrets (ADR 0013 addendum).
// Vault chiffre (AEAD) les secrets et expose le clair via la vue
// `vault.decrypted_secrets`, accessible au service role serveur UNIQUEMENT. Le `db`
// applicatif tourne en service role (cf. client.ts) : ces helpers ne doivent JAMAIS
// être appelés depuis du code client navigateur.
//
// Cardinalité faible assumée (1 secret / cabinet / intégration) — Vault est le bon
// outil ici (cf. ADR 0013 addendum, objection cardinalité non applicable).

import { sql } from "drizzle-orm";
import { db } from "./client";

/**
 * Crée un secret chiffré dans Vault et retourne son UUID (à stocker en clair, c'est
 * une simple indirection). `secret` est typiquement un JSON sérialisé de tokens.
 */
export async function vaultCreateSecret(
  secret: string,
  name: string,
  description?: string,
): Promise<string> {
  // `description` est NOT NULL côté vault.secrets — on passe '' par défaut (jamais NULL).
  const rows = await db.execute<{ id: string }>(
    sql`SELECT vault.create_secret(${secret}, ${name}, ${description ?? ""}) AS id`,
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("[vault] create_secret n'a pas retourné d'UUID");
  return id;
}

/** Met à jour (rotation) le clair d'un secret Vault existant, identifié par son UUID. */
export async function vaultUpdateSecret(secretId: string, secret: string): Promise<void> {
  await db.execute(sql`SELECT vault.update_secret(${secretId}::uuid, ${secret})`);
}

/**
 * Déchiffre et retourne le clair d'un secret Vault, ou `null` s'il n'existe pas.
 * Lecture via `vault.decrypted_secrets` (service role serveur uniquement).
 */
export async function vaultGetSecret(secretId: string): Promise<string | null> {
  const rows = await db.execute<{ decrypted_secret: string | null }>(
    sql`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${secretId}::uuid`,
  );
  return rows[0]?.decrypted_secret ?? null;
}

/**
 * Supprime définitivement un secret Vault par son UUID (idempotent). Utilisé à la
 * déconnexion d'une intégration : on retire le secret chiffré pour ne pas laisser de
 * matériel d'auth orphelin. La ligne métier reste (soft delete `archived_at`).
 */
export async function vaultDeleteSecret(secretId: string): Promise<void> {
  await db.execute(sql`DELETE FROM vault.secrets WHERE id = ${secretId}::uuid`);
}
