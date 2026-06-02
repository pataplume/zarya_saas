/**
 * F5 — Onboarding client, étape 3a : configuration de la paie (server action authentifiée).
 *
 * Teste la VRAIE server action (apps/web) contre la base de test :
 *  - upsert crm.salaire_config (1-1 client) UNIQUEMENT si service `salaires` actif ;
 *  - refus si service salaires inactif/absent ; idempotence (upsert) ; RBAC ; anti-fuite.
 *
 * `@zarya/auth` mocké ; db service role réel. Réf : KICKOFF Bloc F / F5 ; onboarding-client §6.3.
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

const { configurerSalaireConfigAction } = await import(
  "../../../apps/web/app/(app)/app/clients/salaire-config/actions"
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

function acteur(cabinet_id: string, role = "gestionnaire_salaires") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

async function activerServiceSalaires(cabinet_id: string, client_id: string) {
  await sql`
    INSERT INTO crm.service (cabinet_id, client_id, type, actif, frequence)
    VALUES (${cabinet_id}, ${client_id}, 'salaires', true, 'mensuelle')
  `;
}

function fd(client_id: string, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set("client_id", client_id);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

describe("configurerSalaireConfigAction (F5)", () => {
  test("nominal : upsert salaire_config quand le service salaires est actif", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await activerServiceSalaires(cabinetA.id, cli.id);

    const res = await configurerSalaireConfigAction(
      {},
      fd(cli.id, {
        nombre_employes: "8",
        frequence_paie: "mensuelle",
        date_validation_jour_du_mois: "25",
        logiciel_paie: "swissdec",
        caisse_avs: "Caisse AVS Genève",
        caisse_lpp: "Swiss Life",
      }),
    );
    expect(res.success).toBe(true);

    const [conf] = await sql`
      SELECT nombre_employes, frequence_paie, date_validation_jour_du_mois, logiciel_paie, caisse_avs
      FROM crm.salaire_config WHERE client_id = ${cli.id}`;
    expect(conf?.nombre_employes).toBe(8);
    expect(conf?.frequence_paie).toBe("mensuelle");
    expect(conf?.date_validation_jour_du_mois).toBe(25);
    expect(conf?.logiciel_paie).toBe("swissdec");
    expect(conf?.caisse_avs).toBe("Caisse AVS Genève");
  });

  test("refus : service salaires inactif/absent → pas de config", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const res = await configurerSalaireConfigAction({}, fd(cli.id, { nombre_employes: "3" }));
    expect(res.error).toMatch(/salaires/i);

    const rows = await sql`SELECT client_id FROM crm.salaire_config WHERE client_id = ${cli.id}`;
    expect(rows).toHaveLength(0);
  });

  test("idempotence : un 2e appel met à jour sans dupliquer (PK client_id)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await activerServiceSalaires(cabinetA.id, cli.id);

    await configurerSalaireConfigAction({}, fd(cli.id, { nombre_employes: "5" }));
    const res2 = await configurerSalaireConfigAction({}, fd(cli.id, { nombre_employes: "12" }));
    expect(res2.success).toBe(true);

    const rows = await sql`
      SELECT nombre_employes FROM crm.salaire_config WHERE client_id = ${cli.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nombre_employes).toBe(12);
  });

  test("RBAC : un lecteur ne peut pas configurer la paie", async () => {
    acteur(cabinetA.id, "lecteur");
    const cli = await seedClient(sql, cabinetA.id);
    await activerServiceSalaires(cabinetA.id, cli.id);
    const res = await configurerSalaireConfigAction({}, fd(cli.id, { nombre_employes: "2" }));
    expect(res.error).toMatch(/droits/i);
  });

  test("anti-fuite : ne configure pas un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    await activerServiceSalaires(cabinetB.id, cliB.id);
    const res = await configurerSalaireConfigAction({}, fd(cliB.id, { nombre_employes: "4" }));
    expect(res.error).toMatch(/introuvable/i);

    const rows = await sql`SELECT client_id FROM crm.salaire_config WHERE client_id = ${cliB.id}`;
    expect(rows).toHaveLength(0);
  });
});
