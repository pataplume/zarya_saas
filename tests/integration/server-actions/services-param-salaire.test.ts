/**
 * Lot 2 (ADR 0025 / ADR 0011 Run 6) — server actions services / param_comptable / salaire_config
 * + déclenchement du moteur d'échéances.
 *
 * Teste les VRAIES server actions (apps/web) contre la base de test :
 *  - CRUD service (create/update/désactiver) scopé cabinet, Zod, audit crm.evenement ;
 *  - création de service `tva` (régime dans parametres) → génération d'échéances (Run 6) ;
 *  - upsert param_comptable + maj salaire_config (granulaires) ;
 *  - RBAC (lecteur = lecture seule) ; anti-fuite cross-cabinet (service d'un autre cabinet).
 *
 * `@zarya/auth` mocké ; db service role réel (triggers crm + Zod + moteur @zarya/calendar réels).
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

const { createServiceAction, updateServiceAction, supprimerServiceAction } = await import(
  "../../../apps/web/app/(app)/app/clients/services/actions"
);
const { upsertParamComptableAction } = await import(
  "../../../apps/web/app/(app)/app/clients/param-comptable/actions"
);
const { majSalaireConfigAction } = await import(
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

function acteur(cabinet_id: string, role = "collaborateur") {
  authState.user = { id: randomUUID(), app_metadata: { cabinet_id, role } };
}

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

// ─── crm.service CRUD ─────────────────────────────────────────────────────────

describe("createServiceAction", () => {
  test("nominal : crée un service comptabilité (régime TVA) + événement service_active", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const res = await createServiceAction(
      {},
      fd({
        client_id: cli.id,
        type: "comptabilite",
        frequence: "mensuelle",
        regime_tva: "effective_trimestre",
        notes: "Compta mensuelle",
      }),
    );
    expect(res.success).toBe(true);

    const [svc] = await sql`
      SELECT type, frequence, parametres, actif FROM crm.service
      WHERE client_id = ${cli.id} AND type = 'comptabilite'`;
    expect(svc?.actif).toBe(true);
    expect(svc?.frequence).toBe("mensuelle");
    expect(svc?.parametres).toMatchObject({ regime_tva: "effective_trimestre" });

    const [ev] = await sql`
      SELECT type, ressource_type FROM crm.evenement
      WHERE client_id = ${cli.id} AND type = 'service_active' ORDER BY created_at DESC LIMIT 1`;
    expect(ev?.type).toBe("service_active");
    expect(ev?.ressource_type).toBe("crm.service");
  });

  test("création service tva → génère des échéances (Run 6)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    // Override cabinet : TVA trimestrielle qui matche le service comptabilité + régime.
    const tplId = randomUUID();
    await sql`
      INSERT INTO calendar.template_echeance
        (id, cabinet_id, nom, type_echeance, frequence, service_requis, regime_tva,
         mois_dans_annee, jour_du_mois, delai_alerte_jours, actif)
      VALUES (${tplId}, ${cabinetA.id}, ${"TVA Lot2 " + tplId.slice(0, 8)}, 'tva', 'trimestrielle',
              ARRAY['comptabilite'], ARRAY['effective_trimestre'], ARRAY[2,5,8,11], NULL, 14, true)
    `;

    const res = await createServiceAction(
      {},
      fd({
        client_id: cli.id,
        type: "comptabilite",
        frequence: "trimestrielle",
        regime_tva: "effective_trimestre",
      }),
    );
    expect(res.success).toBe(true);

    // Le moteur a matérialisé des échéances pour ce template/client.
    const ech = await sql`
      SELECT id, type FROM crm.echeance WHERE template_id = ${tplId} AND client_id = ${cli.id}`;
    expect(ech.length).toBeGreaterThan(0);
    expect(ech[0]?.type).toBe("tva");
  });

  test("RBAC : un lecteur ne peut pas créer de service", async () => {
    acteur(cabinetA.id, "lecteur");
    const cli = await seedClient(sql, cabinetA.id);
    const res = await createServiceAction({}, fd({ client_id: cli.id, type: "conseil" }));
    expect(res.error).toBeTruthy();
    const rows = await sql`SELECT id FROM crm.service WHERE client_id = ${cli.id}`;
    expect(rows).toHaveLength(0);
  });

  test("anti-fuite : on ne crée pas un service sur un client d'un autre cabinet", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await createServiceAction({}, fd({ client_id: cliB.id, type: "conseil" }));
    expect(res.error).toBe("Client introuvable");
    const rows = await sql`SELECT id FROM crm.service WHERE client_id = ${cliB.id}`;
    expect(rows).toHaveLength(0);
  });
});

describe("updateServiceAction / supprimerServiceAction", () => {
  async function seedServiceRow(client: TestClient): Promise<string> {
    const id = randomUUID();
    await sql`
      INSERT INTO crm.service (id, cabinet_id, client_id, type, actif, frequence)
      VALUES (${id}, ${client.cabinet_id}, ${client.id}, 'comptabilite', true, 'mensuelle')`;
    return id;
  }

  test("update : modifie la fréquence + le régime (parametres)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    const svcId = await seedServiceRow(cli);

    const res = await updateServiceAction(
      {},
      fd({ id: svcId, frequence: "trimestrielle", regime_tva: "forfaitaire_annuel" }),
    );
    expect(res.success).toBe(true);

    const [svc] = await sql`
      SELECT frequence, parametres FROM crm.service WHERE id = ${svcId}`;
    expect(svc?.frequence).toBe("trimestrielle");
    expect(svc?.parametres).toMatchObject({ regime_tva: "forfaitaire_annuel" });
  });

  test("update anti-fuite : un service d'un autre cabinet est introuvable", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const svcB = await seedServiceRow(cliB);
    const res = await updateServiceAction({}, fd({ id: svcB, frequence: "annuelle" }));
    expect(res.error).toBe("Service introuvable");
    const [svc] = await sql`SELECT frequence FROM crm.service WHERE id = ${svcB}`;
    expect(svc?.frequence).toBe("mensuelle"); // inchangé
  });

  test("supprimer : désactive (actif=false + archived_at)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    const svcId = await seedServiceRow(cli);

    const res = await supprimerServiceAction({}, fd({ id: svcId }));
    expect(res.success).toBe(true);
    const [svc] = await sql`SELECT actif, archived_at FROM crm.service WHERE id = ${svcId}`;
    expect(svc?.actif).toBe(false);
    expect(svc?.archived_at).not.toBeNull();
  });
});

// ─── crm.param_comptable ──────────────────────────────────────────────────────

describe("upsertParamComptableAction", () => {
  test("nominal : upsert logiciel + dates + mode_transmission ; n'écrit pas acces_logiciel_externe", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);

    const res = await upsertParamComptableAction(
      {},
      fd({
        client_id: cli.id,
        logiciel: "bexio",
        date_debut_exercice: "2026-01-01",
        date_bouclement: "2026-12-31",
        mode_transmission: "email",
      }),
    );
    expect(res.success).toBe(true);

    const [pc] = await sql`
      SELECT logiciel, date_debut_exercice::text, date_bouclement::text, mode_transmission,
             acces_logiciel_externe_vault_id
      FROM crm.param_comptable WHERE client_id = ${cli.id}`;
    expect(pc?.logiciel).toBe("bexio");
    expect(pc?.date_bouclement).toBe("2026-12-31");
    expect(pc?.mode_transmission).toBe("email");
    // ⚠️ Sceau Lot 5 (post-0053) : l'upsert param n'écrit aucun credential → vault_id NULL.
    expect(pc?.acces_logiciel_externe_vault_id).toBeNull();
  });

  test("anti-fuite : client d'un autre cabinet introuvable", async () => {
    acteur(cabinetA.id);
    const cliB = await seedClient(sql, cabinetB.id);
    const res = await upsertParamComptableAction(
      {},
      fd({ client_id: cliB.id, logiciel: "cresus" }),
    );
    expect(res.error).toBe("Client introuvable");
    const rows = await sql`SELECT client_id FROM crm.param_comptable WHERE client_id = ${cliB.id}`;
    expect(rows).toHaveLength(0);
  });
});

// ─── crm.salaire_config ───────────────────────────────────────────────────────

describe("majSalaireConfigAction", () => {
  test("nominal : maj fréquence + jour de validation (service salaires actif requis)", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    await sql`
      INSERT INTO crm.service (id, cabinet_id, client_id, type, actif)
      VALUES (${randomUUID()}, ${cabinetA.id}, ${cli.id}, 'salaires', true)`;

    const res = await majSalaireConfigAction(
      {},
      fd({ client_id: cli.id, frequence_paie: "mensuelle", date_validation_jour_du_mois: "25" }),
    );
    expect(res.success).toBe(true);

    const [cfg] = await sql`
      SELECT frequence_paie, date_validation_jour_du_mois
      FROM crm.salaire_config WHERE client_id = ${cli.id}`;
    expect(cfg?.frequence_paie).toBe("mensuelle");
    expect(cfg?.date_validation_jour_du_mois).toBe(25);
  });

  test("refus : service salaires non actif", async () => {
    acteur(cabinetA.id);
    const cli = await seedClient(sql, cabinetA.id);
    const res = await majSalaireConfigAction(
      {},
      fd({ client_id: cli.id, frequence_paie: "mensuelle" }),
    );
    expect(res.error).toBeTruthy();
    const rows = await sql`SELECT client_id FROM crm.salaire_config WHERE client_id = ${cli.id}`;
    expect(rows).toHaveLength(0);
  });
});
