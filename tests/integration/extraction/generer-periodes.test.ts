/**
 * G2 — génération mensuelle des périodes + prépopulation (intégration DB réelle).
 *
 * Vérifie : période créée pour client éligible (salaires actif + config + onboarding terminé) ;
 * prépopulation des éléments récurrents depuis M-1 + report changement non absorbé ; échéance
 * crm.echeance liée ; BLOCAGE si onboarding ≠ terminé ; idempotence. Réf : salaire.md §5 ; KICKOFF G2.
 */
import { genererPeriodesMensuelles } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedElementPaie,
  seedEmploye,
  seedPeriode,
  seedSessionOnboarding,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let clientOk: TestClient; // éligible (onboarding terminé)
let clientBloque: TestClient; // onboarding non terminé

const ANNEE = 2026;
const MOIS = 6; // M-1 = 2026-05 (seedPeriode crée 2026-05)

async function rendreEligible(
  cabinet_id: string,
  client_id: string,
  jour: number,
  termine: boolean,
) {
  await sql`
    INSERT INTO crm.service (cabinet_id, client_id, type, actif, frequence)
    VALUES (${cabinet_id}, ${client_id}, 'salaires', true, 'mensuelle')`;
  await sql`
    INSERT INTO crm.salaire_config (client_id, cabinet_id, date_validation_jour_du_mois)
    VALUES (${client_id}, ${cabinet_id}, ${jour})`;
  const s = await seedSessionOnboarding(sql, cabinet_id, client_id);
  if (termine) {
    await sql`UPDATE salaire.session_onboarding SET statut = 'terminee' WHERE id = ${s.id}`;
  }
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  clientOk = await seedClient(sql, cabinet.id);
  clientBloque = await seedClient(sql, cabinet.id);

  await rendreEligible(cabinet.id, clientOk.id, 25, true);
  await rendreEligible(cabinet.id, clientBloque.id, 20, false);

  // M-1 (2026-05) pour clientOk : 1 élément récurrent (HEURES_NORMALES) + 1 changement non absorbé.
  const employe = await seedEmploye(sql, cabinet.id, clientOk.id);
  const periodeMoins1 = await seedPeriode(sql, cabinet.id, clientOk.id); // 2026-05
  await seedElementPaie(sql, cabinet.id, clientOk.id, periodeMoins1.id, employe.id); // HEURES_NORMALES = recurrent
  await sql`
    INSERT INTO salaire.changement (cabinet_id, client_id, periode_id, employe_id, type, date_effet, source, applique_dans_referentiel)
    VALUES (${cabinet.id}, ${clientOk.id}, ${periodeMoins1.id}, ${employe.id}, 'changement_salaire', '2026-05-15', 'client_dashboard', false)`;
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("genererPeriodesMensuelles (G2)", () => {
  test("crée la période du client éligible, prépopule M-1, bloque l'onboarding non terminé", async () => {
    const res = await genererPeriodesMensuelles({
      annee: ANNEE,
      mois: MOIS,
      cabinet_id: cabinet.id,
    });
    expect(res.crees).toBe(1);
    expect(res.prepopulees).toBe(1);
    expect(res.ignores_onboarding).toBeGreaterThanOrEqual(1);

    // Période créée pour clientOk, statut non_demandee, pré-remplie depuis M-1.
    const [p] = await sql`
      SELECT id, statut, pre_remplie, pre_remplie_depuis,
             date_limite_validation::text AS date_limite
      FROM salaire.periode WHERE client_id = ${clientOk.id} AND annee = ${ANNEE} AND mois = ${MOIS}`;
    expect(p?.statut).toBe("non_demandee");
    expect(p?.pre_remplie).toBe(true);
    expect(p?.pre_remplie_depuis).toBeTruthy();
    expect(p?.date_limite).toBe("2026-06-25");

    // Élément récurrent recopié (source pre_remplie).
    const elems = await sql`
      SELECT source FROM salaire.element_paie WHERE periode_id = ${p?.id}`;
    expect(elems.length).toBeGreaterThanOrEqual(1);
    expect(elems[0]?.source).toBe("pre_remplie");

    // Changement non absorbé reporté.
    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM salaire.changement WHERE periode_id = ${p?.id}`;
    expect(n).toBeGreaterThanOrEqual(1);

    // Échéance liée créée (type salaire).
    const ech = await sql`
      SELECT type FROM crm.echeance
      WHERE client_id = ${clientOk.id} AND type = 'salaire' AND date_echeance = '2026-06-25'`;
    expect(ech.length).toBeGreaterThanOrEqual(1);

    // clientBloque (onboarding non terminé) : aucune période.
    const bloque = await sql`
      SELECT id FROM salaire.periode WHERE client_id = ${clientBloque.id} AND annee = ${ANNEE} AND mois = ${MOIS}`;
    expect(bloque).toHaveLength(0);
  });

  test("idempotence : un 2e passage ne recrée rien", async () => {
    const res = await genererPeriodesMensuelles({
      annee: ANNEE,
      mois: MOIS,
      cabinet_id: cabinet.id,
    });
    expect(res.crees).toBe(0);
    expect(res.ignores_existant).toBeGreaterThanOrEqual(1);
  });
});
