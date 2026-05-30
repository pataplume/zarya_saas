/**
 * Tests d'intégration — persistance anti-clair des tokens Microsoft (Bloc D1).
 *
 * Garantit le modèle ADR 0013 addendum : crm.cabinet_integration ne stocke QUE le
 * `vault_secret_id` ; le JSON des tokens vit chiffré dans Supabase Vault. On vérifie :
 *
 *  1. Anti-clair : aucune colonne de la ligne ne contient le token en clair ;
 *     seul `vault_secret_id` (un UUID) y figure.
 *  2. Round-trip Vault : `vault.decrypted_secrets` restitue le JSON exact des tokens.
 *  3. Refresh proactif (-5 min) : un access_token expiré déclenche un refresh,
 *     ROTE le secret Vault (nouveau contenu déchiffré) sans changer le `vault_secret_id`.
 *
 * Utilise le vrai `db` (@zarya/db, service role) — le chemin applicatif réel.
 */
import {
  getValidMicrosoftAccessToken,
  MICROSOFT_SCOPES,
  type MicrosoftOAuthConfig,
  type MicrosoftTokenSet,
  saveMicrosoftTokens,
} from "@zarya/integrations";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const config: MicrosoftOAuthConfig = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  tenant: "common",
  redirectUri: "https://app.zarya.test/api/integrations/microsoft/callback",
  scopes: [...MICROSOFT_SCOPES],
};

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("Persistance anti-clair des tokens Microsoft (D1)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  const vaultSecretIds: string[] = [];

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    // Nettoyer les secrets Vault créés (cleanupCabinets ne touche pas vault.secrets).
    if (vaultSecretIds.length > 0) {
      await sql`DELETE FROM vault.secrets WHERE id = ANY(${sql.array(vaultSecretIds)}::uuid[])`;
    }
    await cleanupCabinets(sql, cabinetA.id);
    await sql.end();
  });

  test("la ligne ne stocke aucun token en clair, seulement vault_secret_id", async () => {
    const tokens: MicrosoftTokenSet = {
      access_token: "AT-CLAIR-NE-DOIT-PAS-FUIR",
      refresh_token: "RT-CLAIR-NE-DOIT-PAS-FUIR",
      token_type: "Bearer",
      scope: MICROSOFT_SCOPES.join(" "),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    await saveMicrosoftTokens(cabinetA.id, tokens, {
      user_principal_name: "user@cabinet.test",
      tenant_id: "tenant-xyz",
    });

    const [row] = await sql`
      SELECT id, vault_secret_id, statut, row_to_json(ci) AS full
      FROM crm.cabinet_integration ci
      WHERE cabinet_id = ${cabinetA.id} AND archived_at IS NULL
    `;
    expect(row?.vault_secret_id).toBeTruthy();
    expect(row?.statut).toBe("actif");
    vaultSecretIds.push(row?.vault_secret_id as string);

    // Aucune représentation en clair des tokens dans toute la ligne.
    const serialized = JSON.stringify(row?.full);
    expect(serialized).not.toContain(tokens.access_token);
    expect(serialized).not.toContain(tokens.refresh_token);

    // Le round-trip Vault restitue le JSON exact des tokens.
    const [secret] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${row?.vault_secret_id}
    `;
    expect(JSON.parse(secret?.decrypted_secret as string)).toEqual(tokens);
  });

  test("le refresh proactif rote le secret Vault sans changer le vault_secret_id", async () => {
    const expired: MicrosoftTokenSet = {
      access_token: "AT-EXPIRE",
      refresh_token: "RT-INITIAL",
      token_type: "Bearer",
      scope: MICROSOFT_SCOPES.join(" "),
      // Déjà expiré → force le refresh proactif.
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    };
    await saveMicrosoftTokens(cabinetA.id, expired);

    const [before] = await sql`
      SELECT vault_secret_id FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND archived_at IS NULL
    `;
    const secretIdBefore = before?.vault_secret_id as string;
    if (!vaultSecretIds.includes(secretIdBefore)) vaultSecretIds.push(secretIdBefore);

    // Microsoft renvoie un access_token frais (et un nouveau refresh_token).
    mockFetch({
      access_token: "AT-FRAIS",
      refresh_token: "RT-ROTE",
      token_type: "Bearer",
      scope: MICROSOFT_SCOPES.join(" "),
      expires_in: 3600,
    });

    const accessToken = await getValidMicrosoftAccessToken(cabinetA.id, config);
    expect(accessToken).toBe("AT-FRAIS");

    const [after] = await sql`
      SELECT vault_secret_id FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND archived_at IS NULL
    `;
    // Même indirection (UUID inchangé) — c'est le CONTENU chiffré qui est roté.
    expect(after?.vault_secret_id).toBe(secretIdBefore);

    const [secret] = await sql`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${secretIdBefore}
    `;
    const rotated = JSON.parse(secret?.decrypted_secret as string) as MicrosoftTokenSet;
    expect(rotated.access_token).toBe("AT-FRAIS");
    expect(rotated.refresh_token).toBe("RT-ROTE");
  });
});
