/**
 * G4a — pilotage fiduciaire (lecture) : KPIs + tableau par client + vue annuelle (DB réelle).
 *
 * Vérifie : vue salaire.v_periode_fiduciaire scopée cabinet, comptage KPI par statut, vue
 * annuelle d'un client, scope cross-cabinet. Réf : salaire.md §6 ; migration 0038 ; KICKOFF G4.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getKpisFiduciaire,
  getPeriodesFiduciaire,
  getVueAnnuelleClient,
} from "../../../apps/web/lib/salaire-fiduciaire-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA1: TestClient;
let clientA2: TestClient;
let clientB: TestClient;

async function periode(cabinet_id: string, client_id: string, mois: number, statut: string) {
  await sql`
    INSERT INTO salaire.periode (cabinet_id, client_id, annee, mois, statut, date_limite_validation)
    VALUES (${cabinet_id}, ${client_id}, 2026, ${mois}, ${statut}::salaire.statut_periode,
            ${`2026-${String(mois).padStart(2, "0")}-25`})`;
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA1 = await seedClient(sql, cabinetA.id);
  clientA2 = await seedClient(sql, cabinetA.id);
  clientB = await seedClient(sql, cabinetB.id);

  // Mois 6 cabinet A : clientA1 validee, clientA2 en_retard.
  await periode(cabinetA.id, clientA1.id, 6, "validee");
  await periode(cabinetA.id, clientA2.id, 6, "en_retard");
  // Mois 6 cabinet B : clientB en_attente (ne doit pas fuiter côté A).
  await periode(cabinetB.id, clientB.id, 6, "en_attente");
  // clientA1 : 2 autres mois pour la vue annuelle.
  await periode(cabinetA.id, clientA1.id, 5, "validee");
  await periode(cabinetA.id, clientA1.id, 7, "non_demandee");
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("pilotage fiduciaire (G4a)", () => {
  test("tableau du mois : périodes du cabinet seulement, triées par client", async () => {
    const rows = await getPeriodesFiduciaire(cabinetA.id, 2026, 6);
    expect(rows).toHaveLength(2);
    expect(rows.every((p) => p.client_id === clientA1.id || p.client_id === clientA2.id)).toBe(
      true,
    );
    expect(rows.some((p) => p.client_id === clientB.id)).toBe(false);
  });

  test("KPIs : comptage par statut sur le mois, scopé cabinet", async () => {
    const k = await getKpisFiduciaire(cabinetA.id, 2026, 6);
    expect(k.total).toBe(2);
    expect(k.validees).toBe(1);
    expect(k.en_retard).toBe(1);
    // Le cabinet B a sa propre période en_attente, invisible ici.
    const kb = await getKpisFiduciaire(cabinetB.id, 2026, 6);
    expect(kb.total).toBe(1);
    expect(kb.a_valider).toBe(1);
  });

  test("vue annuelle d'un client : toutes ses périodes de l'année, par mois", async () => {
    const annee = await getVueAnnuelleClient(cabinetA.id, clientA1.id, 2026);
    expect(annee.map((p) => p.mois)).toEqual([5, 6, 7]);
    // Scope : depuis le cabinet B, le client A1 n'a aucune période visible.
    expect(await getVueAnnuelleClient(cabinetB.id, clientA1.id, 2026)).toHaveLength(0);
  });
});
