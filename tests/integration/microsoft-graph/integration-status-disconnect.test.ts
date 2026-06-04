/**
 * Tests d'intégration — statut d'intégration + déconnexion Microsoft (écran
 * /parametres/integrations). Vérifie :
 *  1. getMicrosoftIntegrationStatus reflète une intégration active (connected, params) ;
 *  2. archiveMicrosoftIntegration archive la ligne (soft delete) ET supprime le secret
 *     Vault (anti-orphelin) ;
 *  3. après déconnexion, le statut redevient « non connecté » (la ligne archivée n'est
 *     plus retournée) ;
 *  4. idempotence : déconnecter deux fois ne lève pas.
 * Utilise le vrai `db` (service role) — chemin applicatif réel.
 */
import {
  archiveMicrosoftIntegration,
  getMicrosoftIntegrationStatus,
  type MicrosoftTokenSet,
  saveMicrosoftTokens,
} from "@zarya/integrations";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const tokens: MicrosoftTokenSet = {
  access_token: "access-xyz",
  refresh_token: "refresh-xyz",
  scope: "Mail.Read offline_access",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};

describe("Statut + déconnexion intégration Microsoft (/parametres/integrations)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
  });

  afterAll(async () => {
    await sql`DELETE FROM vault.secrets WHERE name LIKE ${`microsoft_graph:${cabinetA.id}:%`}`;
    await cleanupCabinets(sql, cabinetA.id);
    await sql.end();
  });

  test("statut actif puis déconnexion (archive + suppression Vault) puis non connecté", async () => {
    await saveMicrosoftTokens(cabinetA.id, tokens, {
      user_principal_name: "compta@cabinet.test",
      tenant_region: "CHE",
      region_adequate: true,
    });

    const before = await getMicrosoftIntegrationStatus(cabinetA.id);
    expect(before.connected).toBe(true);
    expect(before.statut).toBe("actif");
    expect(before.parametres.user_principal_name).toBe("compta@cabinet.test");

    // Le secret Vault existe avant déconnexion.
    const [{ vault_secret_id }] = (await sql`
      SELECT vault_secret_id FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND provider = 'microsoft_graph' AND archived_at IS NULL
    `) as unknown as { vault_secret_id: string }[];
    const secretsAvant = await sql`SELECT 1 FROM vault.secrets WHERE id = ${vault_secret_id}::uuid`;
    expect(secretsAvant.length).toBe(1);

    await archiveMicrosoftIntegration(cabinetA.id);

    // La ligne est archivée (soft delete) et le secret Vault supprimé.
    const [archived] = (await sql`
      SELECT archived_at, statut FROM crm.cabinet_integration
      WHERE cabinet_id = ${cabinetA.id} AND provider = 'microsoft_graph'
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as { archived_at: string | null; statut: string }[];
    expect(archived?.archived_at).toBeTruthy();
    expect(archived?.statut).toBe("revoque");
    const secretsApres = await sql`SELECT 1 FROM vault.secrets WHERE id = ${vault_secret_id}::uuid`;
    expect(secretsApres.length).toBe(0);

    const after = await getMicrosoftIntegrationStatus(cabinetA.id);
    expect(after.connected).toBe(false);
    expect(after.statut).toBeNull();

    // Idempotence : une 2e déconnexion ne lève pas.
    await expect(archiveMicrosoftIntegration(cabinetA.id)).resolves.toBeUndefined();
  });
});
