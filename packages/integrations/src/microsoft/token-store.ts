// Persistance des tokens Microsoft (Bloc D1) — chiffrés au repos via Supabase Vault.
// Modèle anti-clair (ADR 0013 addendum) : crm.cabinet_integration ne stocke QUE le
// `vault_secret_id` ; le JSON des tokens vit dans Vault. Les tokens ne sont jamais
// loggués (aucun log de token ici ; redact pino repo-wide = TODO phase 2).

import { randomUUID } from "node:crypto";
import {
  and,
  cabinetIntegration,
  db,
  eq,
  isNull,
  vaultCreateSecret,
  vaultGetSecret,
  vaultUpdateSecret,
} from "@zarya/db";
import { MicrosoftGraphError } from "./errors";
import { isAccessTokenExpiring, refreshAccessToken } from "./oauth";
import type { MicrosoftIntegrationParams, MicrosoftOAuthConfig, MicrosoftTokenSet } from "./types";

const PROVIDER = "microsoft_graph" as const;
// NB (D2) : ce provider est aussi la valeur logée dans audit.api_externe.provider.

function secretName(cabinet_id: string): string {
  // Nom unique (Vault impose l'unicité du nom) — on évite toute collision avec un
  // ancien secret archivé en suffixant un UUID.
  return `microsoft_graph:${cabinet_id}:${randomUUID()}`;
}

async function findActiveRow(cabinet_id: string) {
  const rows = await db
    .select({
      id: cabinetIntegration.id,
      vault_secret_id: cabinetIntegration.vault_secret_id,
      parametres: cabinetIntegration.parametres,
    })
    .from(cabinetIntegration)
    .where(
      and(
        eq(cabinetIntegration.cabinet_id, cabinet_id),
        eq(cabinetIntegration.provider, PROVIDER),
        isNull(cabinetIntegration.archived_at),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Écrit (ou met à jour) les tokens d'un cabinet : crée/rote le secret Vault et
 * persiste son UUID + les `parametres` NON sensibles. Statut → 'actif'.
 */
export async function saveMicrosoftTokens(
  cabinet_id: string,
  tokens: MicrosoftTokenSet,
  params: MicrosoftIntegrationParams = {},
): Promise<void> {
  const secretJson = JSON.stringify(tokens);
  const parametres = { ...params, scope: tokens.scope, expires_at: tokens.expires_at };
  const existing = await findActiveRow(cabinet_id);

  if (existing) {
    let vaultSecretId = existing.vault_secret_id;
    if (vaultSecretId) await vaultUpdateSecret(vaultSecretId, secretJson);
    else vaultSecretId = await vaultCreateSecret(secretJson, secretName(cabinet_id));
    await db
      .update(cabinetIntegration)
      .set({
        vault_secret_id: vaultSecretId,
        statut: "actif",
        parametres,
        derniere_erreur: null,
        updated_at: new Date(),
      })
      .where(eq(cabinetIntegration.id, existing.id));
    return;
  }

  const vaultSecretId = await vaultCreateSecret(secretJson, secretName(cabinet_id));
  await db.insert(cabinetIntegration).values({
    cabinet_id,
    provider: PROVIDER,
    vault_secret_id: vaultSecretId,
    statut: "actif",
    parametres,
  });
}

export interface LoadedMicrosoftTokens {
  integrationId: string;
  vaultSecretId: string;
  tokens: MicrosoftTokenSet;
  parametres: MicrosoftIntegrationParams;
}

/** Charge et déchiffre les tokens actifs d'un cabinet, ou `null` si non connecté. */
export async function loadMicrosoftTokens(
  cabinet_id: string,
): Promise<LoadedMicrosoftTokens | null> {
  const row = await findActiveRow(cabinet_id);
  if (!row?.vault_secret_id) return null;
  const secret = await vaultGetSecret(row.vault_secret_id);
  if (!secret) return null;
  return {
    integrationId: row.id,
    vaultSecretId: row.vault_secret_id,
    tokens: JSON.parse(secret) as MicrosoftTokenSet,
    parametres: (row.parametres ?? {}) as MicrosoftIntegrationParams,
  };
}

/**
 * Retourne un access_token valide pour ce cabinet, en rafraîchissant proactivement
 * (-5 min) si nécessaire. Rote le secret Vault au passage. Lève `not_connected` si
 * aucune intégration, `revoked` si le refresh_token n'est plus valide (statut persisté).
 */
export async function getValidMicrosoftAccessToken(
  cabinet_id: string,
  config: MicrosoftOAuthConfig,
  now: number = Date.now(),
): Promise<string> {
  const loaded = await loadMicrosoftTokens(cabinet_id);
  if (!loaded) {
    throw new MicrosoftGraphError(
      "not_connected",
      "Aucune intégration Microsoft active pour ce cabinet.",
    );
  }
  if (!isAccessTokenExpiring(loaded.tokens, now)) return loaded.tokens.access_token;

  let refreshed: MicrosoftTokenSet;
  try {
    refreshed = await refreshAccessToken(config, loaded.tokens.refresh_token, now);
  } catch (err) {
    if (err instanceof MicrosoftGraphError && err.code === "revoked") {
      await db
        .update(cabinetIntegration)
        .set({ statut: "revoque", derniere_erreur: err.message, updated_at: new Date() })
        .where(eq(cabinetIntegration.id, loaded.integrationId));
    }
    throw err;
  }

  await vaultUpdateSecret(loaded.vaultSecretId, JSON.stringify(refreshed));
  await db
    .update(cabinetIntegration)
    .set({
      statut: "actif",
      parametres: {
        ...loaded.parametres,
        scope: refreshed.scope,
        expires_at: refreshed.expires_at,
      },
      updated_at: new Date(),
    })
    .where(eq(cabinetIntegration.id, loaded.integrationId));
  return refreshed.access_token;
}
