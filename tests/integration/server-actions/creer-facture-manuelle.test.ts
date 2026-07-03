/**
 * RUN4 usabilité — Server actions de saisie manuelle de facture.
 *
 * Teste les VRAIES server actions (apps/web) de `factures/nouvelle/actions.ts` contre la base
 * de test : `creerFactureManuelleAction` doit créer une facture.proposition_facture identique
 * (mêmes colonnes) à celle produite par l'extraction IA, à ceci près qu'elle porte
 * `origine_saisie='saisie_manuelle'` et `extraction_invocation_id IS NULL` — arbitrage founder
 * "double validation" (maker-checker) : pas de raccourci direct vers facture.facture.
 *
 * Harness identique à valider-facture.test.ts : `@zarya/auth` mocké, `next/cache` stubé via
 * alias ; db service role réel. Couvre : RBAC lecteur, anti-fuite (client + document d'un
 * autre cabinet), nominal, document déjà utilisé, et un test de régression critique qui
 * enchaîne avec `validerFactureAction` pour prouver la compatibilité du pipeline existant.
 *
 * Références : PLAN-USABILITE-MVP.md RUN4 ; facture.md §6 ; tests/CLAUDE.md § server actions.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanupTestUsers, createTestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedFichierPhysique,
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

const { creerFactureManuelleAction } = await import(
  "../../../apps/web/app/(app)/app/factures/nouvelle/actions"
);
const { validerFactureAction } = await import(
  "../../../apps/web/app/(app)/app/factures/validation/actions"
);

const sql = createServiceClient();

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

async function seedDocumentEligible(cabinetId: string, clientId: string) {
  const fp = await seedFichierPhysique(sql, cabinetId);
  return seedDocument(sql, cabinetId, clientId, fp.id);
}

function fd(clientId: string, documentId: string, over: Record<string, string> = {}): FormData {
  const f = new FormData();
  const base: Record<string, string> = {
    client_id: clientId,
    document_id: documentId,
    fournisseur_raison_sociale: "Boulangerie Dupont Sàrl",
    fournisseur_ide: "CHE-123.456.789",
    numero_facture: "M-2026-001",
    date_emission: "2026-06-15",
    date_echeance: "2026-07-15",
    total_ht: "100",
    total_tva: "8.10",
    total_ttc: "108.10",
    montant_a_payer: "108.10",
    taux_tva_principal: "8.1",
    devise: "CHF",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  return f;
}

describe("creerFactureManuelleAction (RUN4)", () => {
  test("RBAC : un lecteur ne peut pas créer", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    authState.user = user.authUser;
    const doc = await seedDocumentEligible(cabinetA.id, clientA.id);

    const res = await creerFactureManuelleAction({}, fd(clientA.id, doc.id));
    expect(res.error).toMatch(/droits/i);

    const [count] = await sql`
      SELECT COUNT(*)::int AS n FROM facture.proposition_facture WHERE document_id = ${doc.id}
    `;
    expect(count?.n).toBe(0);

    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : client d'un autre cabinet", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const clientB = await seedClient(sql, cabinetB.id);
    const docB = await seedDocumentEligible(cabinetB.id, clientB.id);

    const res = await creerFactureManuelleAction({}, fd(clientB.id, docB.id));
    expect(res.error).toMatch(/introuvable/i);

    const [count] = await sql`
      SELECT COUNT(*)::int AS n FROM facture.proposition_facture WHERE document_id = ${docB.id}
    `;
    expect(count?.n).toBe(0);

    await cleanupTestUsers(sql, user);
  });

  test("anti-fuite : document d'un autre cabinet (client A valide, document B)", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const clientB = await seedClient(sql, cabinetB.id);
    const docB = await seedDocumentEligible(cabinetB.id, clientB.id);

    const res = await creerFactureManuelleAction({}, fd(clientA.id, docB.id));
    expect(res.error).toMatch(/introuvable/i);

    const [count] = await sql`
      SELECT COUNT(*)::int AS n FROM facture.proposition_facture WHERE document_id = ${docB.id}
    `;
    expect(count?.n).toBe(0);

    await cleanupTestUsers(sql, user);
  });

  test("nominal : crée une proposition manuelle a_valider, sans invocation IA", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const doc = await seedDocumentEligible(cabinetA.id, clientA.id);

    const res = await creerFactureManuelleAction({}, fd(clientA.id, doc.id));
    expect(res.success).toBe(true);
    expect(res.proposition_id).toBeTruthy();

    const [p] = await sql`
      SELECT origine_saisie, extraction_invocation_id, statut, cabinet_id, client_id, document_id
      FROM facture.proposition_facture WHERE id = ${res.proposition_id}
    `;
    expect(p?.origine_saisie).toBe("saisie_manuelle");
    expect(p?.extraction_invocation_id).toBeNull();
    expect(p?.statut).toBe("a_valider");
    expect(p?.cabinet_id).toBe(cabinetA.id);
    expect(p?.client_id).toBe(clientA.id);
    expect(p?.document_id).toBe(doc.id);

    await cleanupTestUsers(sql, user);
  });

  test("document déjà utilisé : la 2e tentative échoue sans créer de 2e ligne", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const doc = await seedDocumentEligible(cabinetA.id, clientA.id);

    const res1 = await creerFactureManuelleAction({}, fd(clientA.id, doc.id));
    expect(res1.success).toBe(true);

    const res2 = await creerFactureManuelleAction(
      {},
      fd(clientA.id, doc.id, { numero_facture: "M-2026-002" }),
    );
    expect(res2.error).toMatch(/déjà rattaché/i);

    const [count] = await sql`
      SELECT COUNT(*)::int AS n FROM facture.proposition_facture WHERE document_id = ${doc.id}
    `;
    expect(count?.n).toBe(1);

    await cleanupTestUsers(sql, user);
  });

  test("régression critique : validerFactureAction accepte une proposition manuelle", async () => {
    const user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
    authState.user = user.authUser;
    const doc = await seedDocumentEligible(cabinetA.id, clientA.id);

    const creation = await creerFactureManuelleAction({}, fd(clientA.id, doc.id));
    expect(creation.success).toBe(true);
    const propositionId = creation.proposition_id as string;

    const validationForm = new FormData();
    const validationValues: Record<string, string> = {
      proposition_id: propositionId,
      fournisseur_raison_sociale: "Boulangerie Dupont Sàrl",
      fournisseur_ide: "CHE-123.456.789",
      numero_facture: "M-2026-001",
      date_emission: "2026-06-15",
      date_echeance: "2026-07-15",
      total_ht: "100",
      total_tva: "8.10",
      total_ttc: "108.10",
      montant_a_payer: "108.10",
      taux_tva_principal: "8.1",
      devise: "CHF",
      compte_charge: "6000",
    };
    for (const [k, v] of Object.entries(validationValues)) validationForm.set(k, v);

    const res = await validerFactureAction({}, validationForm);
    expect(res.success).toBe(true);

    const [fact] = await sql`
      SELECT statut FROM facture.facture WHERE proposition_id = ${propositionId}
    `;
    expect(fact?.statut).toBe("validee");

    await cleanupTestUsers(sql, user);
  });
});
