/**
 * E5b — Server actions de validation de facture (authentifiées).
 *
 * Teste les VRAIES server actions (apps/web) du flux E5b contre la base de test :
 *  - `validerFactureAction` : AUTH + SCOPE cabinet + RBAC, puis délègue à `finaliserFacture`
 *    (E5a) → crée facture.facture + fournisseur (IBAN→Vault) ;
 *  - `rejeterFactureAction` : proposition → rejetee.
 *
 * Harness identique à valider-lot.test.ts : `@zarya/auth` mocké, `next/cache` stubé via alias ;
 * db service role + finaliserFacture + Vault réels. Couvre : nominal, RBAC lecteur, anti-fuite.
 *
 * Références : KICKOFF § BLOC E / E5b ; facture.md §6 ; tests/CLAUDE.md § server actions.
 */
import { vaultGetSecret } from "@zarya/db";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedPropositionFacture,
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

const { validerFactureAction, rejeterFactureAction } = await import(
  "../../../apps/web/app/(app)/app/factures/validation/actions"
);

const sql = createServiceClient();
const IBAN = "CH9300762011623852957";

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;

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
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function fd(propositionId: string, over: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    proposition_id: propositionId,
    fournisseur_raison_sociale: "Swisscom SA",
    fournisseur_ide: "CHE-116.281.710",
    fournisseur_iban: IBAN,
    numero_facture: "F-2026-001",
    date_emission: "2026-04-15",
    total_ht: "100",
    total_tva: "8.10",
    total_ttc: "108.10",
    montant_a_payer: "108.10",
    taux_tva_principal: "8.1",
    devise: "CHF",
    compte_charge: "6000",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}

describe("validerFactureAction (E5b)", () => {
  test("nominal : crée la facture + fournisseur ; IBAN en Vault ; proposition validee", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const prop = await seedPropositionFacture(sql, cabinetA.id, clientA.id);

    const res = await validerFactureAction({}, fd(prop.id));
    expect(res.success).toBe(true);

    const [fact] = await sql`
      SELECT statut, iban_paiement_vault_id FROM facture.facture
       WHERE proposition_id = ${prop.id}
    `;
    expect(fact?.statut).toBe("validee");
    expect(await vaultGetSecret(fact?.iban_paiement_vault_id as string)).toBe(IBAN);

    const [p] = await sql`SELECT statut FROM facture.proposition_facture WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("validee");

    await cleanupTestUsers(sql, user);
  });

  test("RBAC : un lecteur ne peut pas valider", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const prop = await seedPropositionFacture(sql, cabinetA.id, clientA.id);

    const res = await validerFactureAction({}, fd(prop.id));
    expect(res.error).toMatch(/droits/i);

    const [p] = await sql`SELECT statut FROM facture.proposition_facture WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("a_valider");
    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : ne valide pas une proposition d'un autre cabinet", async () => {
    const userA = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = userA.authUser;
    const clientB = await seedClient(sql, cabinetB.id);
    const propB = await seedPropositionFacture(sql, cabinetB.id, clientB.id);

    const res = await validerFactureAction({}, fd(propB.id));
    expect(res.error).toMatch(/introuvable/i);

    const [p] = await sql`SELECT statut FROM facture.proposition_facture WHERE id = ${propB.id}`;
    expect(p?.statut).toBe("a_valider");
    await cleanupTestUsers(sql, userA);
  });

  test("rejeterFactureAction : proposition → rejetee", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const prop = await seedPropositionFacture(sql, cabinetA.id, clientA.id);

    const res = await rejeterFactureAction(prop.id, "Pas une facture");
    expect(res.success).toBe(true);

    const [p] =
      await sql`SELECT statut, rejet_motif FROM facture.proposition_facture WHERE id = ${prop.id}`;
    expect(p?.statut).toBe("rejetee");
    expect(p?.rejet_motif).toBe("Pas une facture");
    await cleanupTestUsers(sql, user);
  });
});
