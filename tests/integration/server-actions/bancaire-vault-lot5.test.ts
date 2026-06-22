/**
 * Lot 5 (ADR 0025 §6) — server actions bancaire / facturation / accès logiciel + sceau anti-clair.
 *
 * Teste les VRAIES server actions (apps/web) contre la base de test :
 *  - crm.banque : create/update/supprimer → IBAN & credentials Open Banking CHIFFRÉS au Vault
 *    (la table ne porte que *_vault_id + iban_masque ; round-trip Vault restitue le clair) ;
 *  - crm.relation : honoraires/pack en clair + iban_facturation au Vault (masque affiché) ;
 *  - crm.param_comptable : acces_logiciel_externe au Vault ;
 *  - RBAC (lecteur refusé), anti-fuite cross-cabinet, audit crm.evenement ;
 *  - ANTI-CLAIR : aucune valeur sensible en clair au repos (seuls UUID Vault + masque).
 *
 * ⚠️ Requiert que la migration 0053 soit appliquée à la base de test (colonnes *_vault_id).
 * `@zarya/auth` mocké ; db service role réel ; secrets Vault nettoyés en fin de suite.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { createBanqueAction, updateBanqueAction, supprimerBanqueAction } = await import(
  "../../../apps/web/app/(app)/app/clients/banque/actions"
);
const { upsertRelationAction } = await import(
  "../../../apps/web/app/(app)/app/clients/facturation/actions"
);
const { upsertAccesLogicielAction } = await import(
  "../../../apps/web/app/(app)/app/clients/acces-logiciel/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

const IBAN = "CH9300762011623852957";
const IBAN_2 = "CH5604835012345678009";

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
});

afterEach(() => {
  authState.user = null;
});

afterAll(async () => {
  // Purge des secrets Vault créés par les actions (cleanupCabinets ne touche pas vault.secrets).
  const ids = await sql<{ id: string }[]>`
    SELECT id FROM vault.secrets WHERE name LIKE 'crm/banque/%' OR name LIKE 'crm/relation/%'
       OR name LIKE 'crm/param_comptable/%'`;
  if (ids.length > 0) {
    await sql`DELETE FROM vault.secrets WHERE id = ANY(${sql.array(ids.map((r) => r.id))}::uuid[])`;
  }
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function acteur(cabinet_id: string, role = "collaborateur") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("crm.banque — write-path Vault (Lot 5)", () => {
  test("create : IBAN + credentials chiffrés au Vault, masque stocké, aucun clair", async () => {
    acteur(cabinetA.id);
    const res = await createBanqueAction(
      {},
      fd({
        client_id: clientA.id,
        nom_banque: "UBS",
        iban: IBAN,
        usage: "principal",
        credentials_open_banking: "secret-open-banking",
      }),
    );
    expect(res.success).toBe(true);

    const [row] = await sql<
      {
        id: string;
        iban_vault_id: string | null;
        iban_masque: string | null;
        credentials_open_banking_vault_id: string | null;
      }[]
    >`SELECT id, iban_vault_id, iban_masque, credentials_open_banking_vault_id
        FROM crm.banque WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientA.id}
       ORDER BY created_at DESC LIMIT 1`;
    expect(row?.iban_vault_id).toBeTruthy();
    expect(row?.credentials_open_banking_vault_id).toBeTruthy();
    // Masque = 4 derniers caractères, jamais l'IBAN complet.
    expect(row?.iban_masque).toBe("****2957");
    expect(row?.iban_masque).not.toContain(IBAN.slice(0, 8));

    // Round-trip Vault : le clair est restitué intact via vault.decrypted_secrets.
    const [dec] = await sql<{ decrypted_secret: string }[]>`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${row?.iban_vault_id}::uuid`;
    expect(dec?.decrypted_secret).toBe(IBAN);
  });

  test("audit : un crm.evenement est émis à la création", async () => {
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
       WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientA.id}
         AND ressource_type = 'crm.banque'`;
    expect(rows[0]?.n).toBeGreaterThan(0);
  });

  test("update : rotation de l'IBAN au Vault (même UUID), nouveau masque", async () => {
    acteur(cabinetA.id);
    const [b] = await sql<{ id: string; iban_vault_id: string }[]>`
      SELECT id, iban_vault_id FROM crm.banque
       WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientA.id}
       ORDER BY created_at DESC LIMIT 1`;
    if (!b) throw new Error("compte attendu absent");
    const res = await updateBanqueAction({}, fd({ id: b.id, iban: IBAN_2 }));
    expect(res.success).toBe(true);

    const [after] = await sql<{ iban_vault_id: string; iban_masque: string }[]>`
      SELECT iban_vault_id, iban_masque FROM crm.banque WHERE id = ${b.id}`;
    expect(after?.iban_vault_id).toBe(b.iban_vault_id); // rotation en place
    expect(after?.iban_masque).toBe("****8009");
    const [dec] = await sql<{ decrypted_secret: string }[]>`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${b.iban_vault_id}::uuid`;
    expect(dec?.decrypted_secret).toBe(IBAN_2);
  });

  test("create : rejette un IBAN au checksum invalide", async () => {
    acteur(cabinetA.id);
    const res = await createBanqueAction(
      {},
      fd({ client_id: clientA.id, iban: "CH9300762011623852958" }),
    );
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/IBAN/i);
  });

  test("RBAC : un lecteur ne peut pas créer de compte", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await createBanqueAction({}, fd({ client_id: clientA.id, iban: IBAN }));
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/autoris/i);
  });

  test("anti-fuite : cabinet B ne peut pas créer un compte sur le client de A", async () => {
    acteur(cabinetB.id);
    const res = await createBanqueAction({}, fd({ client_id: clientA.id, iban: IBAN }));
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/introuvable/i);
  });

  test("supprimer : soft-delete + purge des secrets Vault", async () => {
    acteur(cabinetA.id);
    const [b] = await sql<{ id: string; iban_vault_id: string }[]>`
      SELECT id, iban_vault_id FROM crm.banque
       WHERE cabinet_id = ${cabinetA.id} AND client_id = ${clientA.id} AND archived_at IS NULL
       ORDER BY created_at DESC LIMIT 1`;
    if (!b) throw new Error("compte attendu absent");
    const res = await supprimerBanqueAction({}, fd({ id: b.id }));
    expect(res.success).toBe(true);
    const [after] = await sql<{ archived_at: Date | null; actif: boolean }[]>`
      SELECT archived_at, actif FROM crm.banque WHERE id = ${b.id}`;
    expect(after?.archived_at).not.toBeNull();
    expect(after?.actif).toBe(false);
    const [sec] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM vault.secrets WHERE id = ${b.iban_vault_id}::uuid`;
    expect(sec?.n).toBe(0);
  });
});

describe("crm.relation — honoraires en clair + iban_facturation Vault (Lot 5)", () => {
  test("upsert : honoraires en clair, IBAN facturation au Vault + masque", async () => {
    acteur(cabinetA.id);
    const res = await upsertRelationAction(
      {},
      fd({
        client_id: clientA.id,
        pack_tarifaire: "Pack Pro",
        honoraires_mensuels: "990.00",
        honoraires_modele: "forfait",
        iban_facturation: IBAN,
      }),
    );
    expect(res.success).toBe(true);

    const [row] = await sql<
      {
        pack_tarifaire: string;
        honoraires_mensuels: string;
        iban_facturation_vault_id: string | null;
        iban_facturation_masque: string | null;
      }[]
    >`SELECT pack_tarifaire, honoraires_mensuels, iban_facturation_vault_id, iban_facturation_masque
        FROM crm.relation WHERE client_id = ${clientA.id} AND cabinet_id = ${cabinetA.id}`;
    expect(row?.pack_tarifaire).toBe("Pack Pro"); // non sensible, en clair OK
    expect(Number(row?.honoraires_mensuels)).toBe(990);
    expect(row?.iban_facturation_vault_id).toBeTruthy();
    expect(row?.iban_facturation_masque).toBe("****2957");
    const [dec] = await sql<{ decrypted_secret: string }[]>`
      SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE id = ${row?.iban_facturation_vault_id}::uuid`;
    expect(dec?.decrypted_secret).toBe(IBAN);
  });

  test("anti-fuite : cabinet B ne touche pas la relation du client de A", async () => {
    acteur(cabinetB.id);
    const res = await upsertRelationAction({}, fd({ client_id: clientA.id, pack_tarifaire: "X" }));
    expect(res.success).toBeUndefined();
    expect(res.error).toMatch(/introuvable/i);
  });
});

describe("crm.param_comptable — acces_logiciel_externe Vault (Lot 5)", () => {
  test("upsert : credentials chiffrés au Vault (jamais en clair)", async () => {
    acteur(cabinetA.id);
    const res = await upsertAccesLogicielAction(
      {},
      fd({ client_id: clientA.id, acces_logiciel_externe: "bexio:user/pass" }),
    );
    expect(res.success).toBe(true);
    const [row] = await sql<{ vault_id: string | null }[]>`
      SELECT acces_logiciel_externe_vault_id AS vault_id FROM crm.param_comptable
       WHERE client_id = ${clientA.id} AND cabinet_id = ${cabinetA.id}`;
    expect(row?.vault_id).toBeTruthy();
    const [dec] = await sql<{ decrypted_secret: string }[]>`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${row?.vault_id}::uuid`;
    expect(dec?.decrypted_secret).toBe("bexio:user/pass");
  });

  test("RBAC : un lecteur ne peut pas enregistrer les credentials", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await upsertAccesLogicielAction(
      {},
      fd({ client_id: clientA.id, acces_logiciel_externe: "x" }),
    );
    expect(res.success).toBeUndefined();
  });
});
