/**
 * G4b — server actions fiduciaire : édition « à la place du client », revue, campagne (DB réelle).
 *
 * `@zarya/auth` mocké. Vérifie : saisie fiduciaire (source fiduciaire_saisie + audit diff
 * avant/après dans salaire.evenement), revue → revue_fiduciaire_at + validation fiduciaire,
 * lancement campagne (génère période), RBAC, anti-fuite. Réf : salaire.md §6/§8 ; KICKOFF G4.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { getDeltaPeriode } from "../../../apps/web/lib/salaire-fiduciaire-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEmploye,
  seedPeriode,
  seedSessionOnboarding,
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

const { saisirElementFiduciaireAction, revoirPeriodeAction, lancerCampagneAction } = await import(
  "../../../apps/web/app/(app)/app/salaire/actions"
);

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let employeA: { id: string };
let periodeId: string;
let typeId: string;

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  employeA = await seedEmploye(sql, cabinetA.id, clientA.id);
  periodeId = (await seedPeriode(sql, cabinetA.id, clientA.id)).id; // 2026-05
  const [t] =
    await sql`SELECT id FROM salaire.type_element_paie WHERE cabinet_id IS NULL AND code = 'HEURES_NORMALES'`;
  typeId = t?.id as string;
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
function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("saisirElementFiduciaireAction (G4b)", () => {
  test("saisie fiduciaire + audit diff avant/après", async () => {
    acteur(cabinetA.id);
    await saisirElementFiduciaireAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "160",
      }),
    );
    const res = await saisirElementFiduciaireAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "172",
      }),
    );
    expect(res.success).toBe(true);

    const [el] = await sql`
      SELECT source FROM salaire.element_paie
      WHERE periode_id = ${periodeId} AND employe_id = ${employeA.id} AND type_element_id = ${typeId}`;
    expect(el?.source).toBe("fiduciaire_saisie");

    // Audit diff : un événement element_paie_modifie avec avant=160, apres=172.
    const evs = await sql`
      SELECT metadata FROM salaire.evenement
      WHERE periode_id = ${periodeId} AND type = 'element_paie_modifie' ORDER BY created_at DESC LIMIT 1`;
    expect(Number((evs[0]?.metadata as { avant: unknown })?.avant)).toBe(160);
    expect(Number((evs[0]?.metadata as { apres: unknown })?.apres)).toBe(172);

    const [p] =
      await sql`SELECT derniere_modification_par FROM salaire.periode WHERE id = ${periodeId}`;
    expect(p?.derniere_modification_par).toBe("fiduciaire");
  });

  test("RBAC : un lecteur ne peut pas saisir", async () => {
    acteur(cabinetA.id, "lecteur");
    const res = await saisirElementFiduciaireAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "1",
      }),
    );
    expect(res.error).toMatch(/droits/i);
  });

  test("anti-fuite : période d'un autre cabinet introuvable", async () => {
    acteur(cabinetB.id);
    const res = await saisirElementFiduciaireAction(
      {},
      fd({
        periode_id: periodeId,
        employe_id: employeA.id,
        type_element_id: typeId,
        valeur_numerique: "1",
      }),
    );
    expect(res.error).toMatch(/introuvable/i);
  });
});

describe("revoirPeriodeAction (G4b)", () => {
  test("pose le jalon de revue + validation fiduciaire", async () => {
    const pId = randomUUID();
    await sql`
      INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation, statut)
      VALUES (${pId}, ${cabinetA.id}, ${clientA.id}, 2026, 8, '2026-08-25', 'validee')`;
    acteur(cabinetA.id);
    const res = await revoirPeriodeAction({}, fd({ periode_id: pId }));
    expect(res.success).toBe(true);

    const [p] =
      await sql`SELECT revue_fiduciaire_at, statut FROM salaire.periode WHERE id = ${pId}`;
    expect(p?.revue_fiduciaire_at).not.toBeNull();
    const [v] = await sql`SELECT valide_par_type FROM salaire.validation WHERE periode_id = ${pId}`;
    expect(v?.valide_par_type).toBe("fiduciaire_pour_client");
    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${pId} AND type = 'validation_par_fiduciaire'`;
    expect(ev).toHaveLength(1);
  });
});

describe("lancerCampagneAction + getDeltaPeriode (G4b)", () => {
  test("lance la campagne : crée la période du mois pour un client éligible", async () => {
    // Rendre clientA éligible (service salaires + config + onboarding terminé).
    await sql`INSERT INTO crm.service (cabinet_id, client_id, type, actif, frequence) VALUES (${cabinetA.id}, ${clientA.id}, 'salaires', true, 'mensuelle')`;
    await sql`INSERT INTO crm.salaire_config (client_id, cabinet_id, date_validation_jour_du_mois) VALUES (${clientA.id}, ${cabinetA.id}, 25)`;
    const s = await seedSessionOnboarding(sql, cabinetA.id, clientA.id);
    await sql`UPDATE salaire.session_onboarding SET statut = 'terminee' WHERE id = ${s.id}`;

    acteur(cabinetA.id);
    const res = await lancerCampagneAction({}, fd({ annee: "2026", mois: "9" }));
    expect(res.success).toBe(true);
    expect(res.crees).toBeGreaterThanOrEqual(1);
    const [p] =
      await sql`SELECT id FROM salaire.periode WHERE client_id = ${clientA.id} AND annee = 2026 AND mois = 9`;
    expect(p?.id).toBeTruthy();
  });

  test("delta : éléments différents de la prépopulation", async () => {
    // Périodes M-1 et M avec un élément lié par origine, valeur différente.
    const m1 = randomUUID();
    const m = randomUUID();
    await sql`INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation) VALUES (${m1}, ${cabinetA.id}, ${clientA.id}, 2025, 11, '2025-11-25')`;
    await sql`INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation) VALUES (${m}, ${cabinetA.id}, ${clientA.id}, 2025, 12, '2025-12-25')`;
    const orig = randomUUID();
    await sql`INSERT INTO salaire.element_paie (id, cabinet_id, client_id, periode_id, employe_id, type_element_id, valeur_numerique, source) VALUES (${orig}, ${cabinetA.id}, ${clientA.id}, ${m1}, ${employeA.id}, ${typeId}, 168, 'fiduciaire_saisie')`;
    await sql`INSERT INTO salaire.element_paie (cabinet_id, client_id, periode_id, employe_id, type_element_id, valeur_numerique, source, origine_element_id) VALUES (${cabinetA.id}, ${clientA.id}, ${m}, ${employeA.id}, ${typeId}, 180, 'pre_remplie', ${orig})`;

    const delta = await getDeltaPeriode(cabinetA.id, m);
    expect(delta).toHaveLength(1);
    expect(Number(delta[0]?.valeur_actuelle)).toBe(180);
    expect(Number(delta[0]?.valeur_prepopulee)).toBe(168);
  });
});
