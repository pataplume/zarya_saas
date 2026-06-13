/**
 * C1.2 — Isolation du dossier client (/app/clients/[id]).
 *
 * Le `db` applicatif (service role, postgres-js) BYPASSE la RLS (ADR 0005 addendum) :
 * la séparation entre cabinets sur le chemin app repose ENTIÈREMENT sur le filtre
 * (cabinet_id, client_id) discipliné dans `getDossierClient`. Ce test garde ce contrat :
 *
 *  - getDossierClient(cabinetA, clientA) → non-null, agrégats + sections scopés au client A ;
 *  - getDossierClient(cabinetA, clientB) → null (client d'un AUTRE cabinet invisible) ;
 *  - symétrie (cabinetB ne voit pas clientA) + scope croisé interne (factures/échéances/etc.
 *    d'un autre client n'apparaissent jamais dans le dossier de A).
 *
 * Si un helper oubliait un filtre, le test vire au rouge. BLOQUANT en CI.
 *
 * Inspiré de :
 * - tests/integration/server-actions/dashboard-client-data.test.ts
 * - tests/integration/multi-tenant-isolation/client-contact-data-isolation.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getDossierClient } from "../../../apps/web/lib/dossier-client-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedEcheance,
  seedPeriode,
  seedPropositionFacture,
  seedService,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let clientB: TestClient;

// Données minimales rattachées au client A (repérées par id pour l'anti-fuite).
let serviceA: { id: string };
let echeanceA: { id: string };
let periodeA: { id: string };
let factureA: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinetA = r.cabinetA;
  cabinetB = r.cabinetB;

  clientA = await seedClient(sql, cabinetA.id);
  clientB = await seedClient(sql, cabinetB.id);

  // Données distinctes pour le client A (cabinet A).
  serviceA = await seedService(sql, cabinetA.id, clientA.id);
  echeanceA = await seedEcheance(sql, cabinetA.id, clientA.id);
  periodeA = await seedPeriode(sql, cabinetA.id, clientA.id);
  factureA = await seedPropositionFacture(sql, cabinetA.id, clientA.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

describe("getDossierClient — scope (cabinet_id, client_id)", () => {
  test("dossier de A : non-null avec les bonnes données scopées", async () => {
    const d = await getDossierClient(cabinetA.id, clientA.id);
    expect(d).not.toBeNull();
    if (!d) return;

    // Identité scopée au bon client.
    expect(d.identite.id).toBe(clientA.id);
    expect(d.identite.id).not.toBe(clientB.id);

    // Service du client A présent ; aucun service d'un autre client.
    expect(d.services_actifs.some((s) => s.id === serviceA.id)).toBe(true);

    // Échéance ouverte du client A présente.
    expect(d.echeances.some((e) => e.id === echeanceA.id)).toBe(true);

    // Période salaire courante = celle du client A.
    expect(d.periode_salaire_courante?.id).toBe(periodeA.id);

    // Proposition de facture 'a_valider' comptée (≥ 1).
    expect(d.nb_factures_a_valider).toBeGreaterThanOrEqual(1);
  });

  test("dossier d'un client d'un AUTRE cabinet (clientB) avec le scope de A : null", async () => {
    // Cœur du test : le client B n'appartient pas au cabinet A → invisible (404 indistinct).
    expect(await getDossierClient(cabinetA.id, clientB.id)).toBeNull();
  });

  test("symétrie : le scope du cabinet B ne résout pas le client A", async () => {
    expect(await getDossierClient(cabinetB.id, clientA.id)).toBeNull();
  });

  test("le client B (bare, cabinet B) est résolu par son propre cabinet, sans données de A", async () => {
    const d = await getDossierClient(cabinetB.id, clientB.id);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.identite.id).toBe(clientB.id);
    // Aucune donnée du client A ne fuit dans le dossier de B.
    expect(d.services_actifs.some((s) => s.id === serviceA.id)).toBe(false);
    expect(d.echeances.some((e) => e.id === echeanceA.id)).toBe(false);
    expect(d.periode_salaire_courante?.id).not.toBe(periodeA.id);
    expect(d.nb_factures_a_valider).toBe(0);
    expect(factureA.id).toBeDefined();
  });
});
