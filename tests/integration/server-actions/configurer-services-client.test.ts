/**
 * F4 — Configuration services + checklist documents (server action authentifiée).
 *
 * Teste la VRAIE server action (apps/web) contre la base de test :
 *  - crée crm.service + crm.param_comptable + crm.document_attendu (checklist codée) ;
 *  - idempotence (2e passage ne duplique pas) ; RBAC ; anti-fuite cross-cabinet.
 *
 * `@zarya/auth` mocké ; db service role réel. Réf : KICKOFF Bloc F / F4 ; onboarding-client §6.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata: Record<string, unknown> },
}));
vi.mock("@zarya/auth", () => ({
  requireAuth: async () => {
    if (!authState.user) throw new Error("UnauthorizedError");
    return authState.user;
  },
}));

const { configurerServicesClientAction } = await import(
  "../../../apps/web/app/(app)/app/clients/services/actions"
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
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

function acteur(cabinet_id: string, role = "collaborateur") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

function fd(client_id: string, services: string[], extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set("client_id", client_id);
  for (const s of services) f.append("services", s);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

describe("configurerServicesClientAction (F4)", () => {
  test("nominal : crée services + param_comptable + checklist documents", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const res = await configurerServicesClientAction(
      {},
      fd(cli.id, ["comptabilite", "tva"], {
        compta_logiciel: "bexio",
        compta_plan: "PME CH",
        tva_frequence: "trimestrielle",
      }),
    );
    expect(res.success).toBe(true);
    expect(res.nb_services).toBe(2);
    expect(res.nb_documents).toBeGreaterThanOrEqual(4); // 3 compta + 1 tva

    const services = await sql`SELECT type FROM crm.service WHERE client_id = ${cli.id}`;
    expect(services.map((s) => s.type).sort()).toEqual(["comptabilite", "tva"]);

    const [param] =
      await sql`SELECT logiciel, plan_comptable FROM crm.param_comptable WHERE client_id = ${cli.id}`;
    expect(param?.logiciel).toBe("bexio");

    const docs =
      await sql`SELECT type_document FROM crm.document_attendu WHERE client_id = ${cli.id}`;
    const types = docs.map((d) => d.type_document);
    expect(types).toEqual(expect.arrayContaining(["releve_bancaire", "decompte_tva"]));
  });

  test("idempotence : un 2e passage ne duplique ni service ni document", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    await configurerServicesClientAction({}, fd(cli.id, ["comptabilite"]));
    const res2 = await configurerServicesClientAction({}, fd(cli.id, ["comptabilite"]));
    expect(res2.nb_services).toBe(0);
    expect(res2.nb_documents).toBe(0);

    const [{ n }] =
      await sql`SELECT count(*)::int AS n FROM crm.service WHERE client_id = ${cli.id} AND type = 'comptabilite'`;
    expect(n).toBe(1);
  });

  test("RBAC : un lecteur ne peut pas configurer", async () => {
    acteur(cabinetA.id, "lecteur");
    const cli = await seedClient(sql, cabinetA.id);
    const res = await configurerServicesClientAction({}, fd(cli.id, ["comptabilite"]));
    expect(res.error).toMatch(/droits/i);
  });

  test("anti-fuite : ne configure pas un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await configurerServicesClientAction({}, fd(cliB.id, ["comptabilite"]));
    expect(res.error).toMatch(/introuvable/i);

    const docs = await sql`SELECT id FROM crm.document_attendu WHERE client_id = ${cliB.id}`;
    expect(docs).toHaveLength(0);
  });
});
