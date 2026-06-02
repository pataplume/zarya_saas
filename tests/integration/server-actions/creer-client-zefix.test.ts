/**
 * F3 — Identification entreprise via Zefix (server action authentifiée).
 *
 * Teste la VRAIE server action (apps/web) contre la base de test :
 *  - consentement nLPD obligatoire (pas d'appel sinon, §5.2) ;
 *  - création crm.client + crm.adresse (siège) + audit crm.zefix_recherche_cabinet ;
 *  - fallback manuel si Zefix ne renvoie rien (§5.4) ; RBAC.
 *
 * `@zarya/auth` (requireAuth) et `@zarya/integrations` (zefixClient) sont MOCKÉS (pas d'appel
 * réseau Zefix) ; db service role réel. Réf : KICKOFF Bloc F / F3 ; onboarding-client §5.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
const zefix = vi.hoisted(() => ({ result: null as null | Record<string, unknown>, fail: false }));

vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));
vi.mock("@zarya/integrations", () => ({
  zefixClient: {
    rechercherParIde: async () => {
      if (zefix.fail) throw new Error("zefix down");
      return zefix.result;
    },
  },
}));

const { creerClientDepuisZefixAction } = await import(
  "../../../apps/web/app/(app)/app/clients/zefix/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
});

afterEach(() => {
  authState.user = null;
  zefix.result = null;
  zefix.fail = false;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function fd(ide: string, consentement: string): FormData {
  const f = new FormData();
  f.set("ide", ide);
  f.set("consentement", consentement);
  return f;
}

function acteur(cabinet_id: string, role = "collaborateur") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

describe("creerClientDepuisZefixAction (F3)", () => {
  test("nominal : Zefix trouvé + consentement → client + adresse + audit", async () => {
    acteur(cabinetA.id);
    const ide = `CHE-${randomUUID().slice(0, 3)}.${randomUUID().slice(0, 3)}.${randomUUID().slice(0, 3)}`;
    zefix.result = {
      ehraid: "123",
      ide,
      raison_sociale: "Acme Sàrl",
      forme_juridique: "Société à responsabilité limitée",
      statut: "actif",
      adresse_rue: "Rue du Lac 1",
      adresse_npa: "1000",
      adresse_ville: "Lausanne",
      adresse_canton: "VD",
    };

    const res = await creerClientDepuisZefixAction({}, fd(ide, "true"));
    expect(res.success).toBe(true);
    expect(res.client_id).toMatch(/^[0-9a-f-]{36}$/);

    const [cli] = await sql`
      SELECT raison_sociale, ide, forme_juridique, statut, cabinet_id
        FROM crm.client WHERE id = ${res.client_id}
    `;
    expect(cli?.cabinet_id).toBe(cabinetA.id);
    expect(cli?.raison_sociale).toBe("Acme Sàrl");
    expect(cli?.ide).toBe(ide);

    const [adr] = await sql`
      SELECT type, ville, code_postal, canton, est_principale
        FROM crm.adresse WHERE client_id = ${res.client_id}
    `;
    expect(adr?.type).toBe("siege");
    expect(adr?.ville).toBe("Lausanne");
    expect(adr?.code_postal).toBe("1000");

    const audit = await sql`
      SELECT consentement_donne, ide_selectionne FROM crm.zefix_recherche_cabinet
       WHERE cabinet_id = ${cabinetA.id} AND requete = ${ide}
    `;
    expect(audit.length).toBe(1);
    expect(audit[0]?.consentement_donne).toBe(true);
    expect(audit[0]?.ide_selectionne).toBe(ide);
  });

  test("sans consentement : aucun appel Zefix, aucun client", async () => {
    acteur(cabinetA.id);
    const ide = "CHE-111.111.111";
    zefix.result = { ide, raison_sociale: "X", statut: "actif" };

    const res = await creerClientDepuisZefixAction({}, fd(ide, "false"));
    expect(res.error).toMatch(/consentement/i);

    const audit = await sql`SELECT id FROM crm.zefix_recherche_cabinet WHERE requete = ${ide}`;
    expect(audit).toHaveLength(0);
  });

  test("Zefix sans résultat → fallback manuel + audit nb_resultats 0", async () => {
    acteur(cabinetA.id);
    const ide = `CHE-${randomUUID().slice(0, 3)}.000.000`;
    zefix.result = null;

    const res = await creerClientDepuisZefixAction({}, fd(ide, "true"));
    expect(res.fallback_manuel).toBe(true);
    expect(res.success).toBeUndefined();

    const [audit] = await sql`
      SELECT nb_resultats FROM crm.zefix_recherche_cabinet
       WHERE cabinet_id = ${cabinetA.id} AND requete = ${ide}
    `;
    expect(audit?.nb_resultats).toBe("0");
  });

  test("RBAC : un lecteur ne peut pas créer via Zefix", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await creerClientDepuisZefixAction({}, fd("CHE-222.222.222", "true"));
    expect(res.error).toMatch(/droits/i);
  });
});
