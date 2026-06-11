/**
 * Tests d'isolation — un client_contact ne voit JAMAIS les données d'un autre client.
 *
 * Ces tests sont BLOQUANTS en CI (cf. tests/CLAUDE.md § 1 : « Client contact A cannot
 * see Client contact B data »). Ils couvrent le cœur du risque : DEUX clients du MÊME
 * cabinet. Les vues `v_dashboard_client_*` n'ont AUCUN filtre interne par client, et le
 * `db` applicatif (service role, postgres-js) BYPASSE la RLS — la séparation entre
 * clients d'un même cabinet repose donc ENTIÈREMENT sur le filtre `client_id` discipliné
 * dans chaque helper (`apps/web/lib/dashboard-client-data.ts` + `periode-client-data.ts`).
 * Ce test garde ce contrat : si un helper oubliait le filtre `client_id`, il vire au rouge.
 *
 * Stratégie : seed via service role (bypass RLS), puis appel des VRAIS helpers de lecture
 * (chemin app réel) en vérifiant qu'avec le scope du client A on ne voit jamais une donnée
 * du client B — et symétriquement.
 *
 * Références :
 * - tests/CLAUDE.md § 1 (test obligatoire « Client contact A cannot see Client contact B data »)
 * - apps/web/lib/dashboard-client-data.ts / periode-client-data.ts (helpers scopés client)
 * - ADR 0005 addendum (db service role bypasse la RLS → filtre client_id discipliné)
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getDocumentsClient,
  getEmployesClient,
  getEntrepriseClient,
} from "../../../apps/web/lib/dashboard-client-data";
import { listerPeriodesClient } from "../../../apps/web/lib/periode-client-data";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocument,
  seedEmploye,
  seedFichierPhysique,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

let cabinet: TestCabinet;
let autreCabinet: TestCabinet;

// Deux clients du MÊME cabinet (cœur du test).
let clientA: TestClient;
let clientB: TestClient;
// Un client d'un AUTRE cabinet (bonus cross-cabinet).
let clientAutreCabinet: TestClient;

// Données distinctes par client, repérées par id pour les assertions anti-fuite.
let employeA: { id: string };
let employeB: { id: string };
let documentA: { id: string };
let documentB: { id: string };
let periodeA: { id: string };
let periodeB: { id: string };

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  autreCabinet = r.cabinetB;

  // Deux clients dans le MÊME cabinet.
  clientA = await seedClient(sql, cabinet.id);
  clientB = await seedClient(sql, cabinet.id);
  // Un client de l'autre cabinet (cross-cabinet).
  clientAutreCabinet = await seedClient(sql, autreCabinet.id);

  // Données distinctes pour CLIENT A.
  employeA = await seedEmploye(sql, cabinet.id, clientA.id);
  const fpA = await seedFichierPhysique(sql, cabinet.id);
  documentA = await seedDocument(sql, cabinet.id, clientA.id, fpA.id);
  periodeA = await seedPeriode(sql, cabinet.id, clientA.id);

  // Données distinctes pour CLIENT B (même cabinet).
  employeB = await seedEmploye(sql, cabinet.id, clientB.id);
  const fpB = await seedFichierPhysique(sql, cabinet.id);
  documentB = await seedDocument(sql, cabinet.id, clientB.id, fpB.id);
  periodeB = await seedPeriode(sql, cabinet.id, clientB.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, autreCabinet.id);
  await sql.end();
});

// ─── Intra-cabinet : client A ne voit jamais client B (le test qui manquait) ──

describe("client_contact A ne voit pas les données du client B (même cabinet)", () => {
  test("getEntrepriseClient : renvoie la fiche de A, jamais celle de B", async () => {
    const eA = await getEntrepriseClient(cabinet.id, clientA.id);
    expect(eA?.client_id).toBe(clientA.id);
    // Le scope de A ne doit pas pouvoir résoudre la fiche du client B du même cabinet.
    expect(eA?.client_id).not.toBe(clientB.id);
  });

  test("getEmployesClient : aucun employé du client B", async () => {
    const empsA = await getEmployesClient(cabinet.id, clientA.id);
    expect(empsA.length).toBeGreaterThanOrEqual(1);
    expect(empsA.some((e) => e.id === employeA.id)).toBe(true);
    // Anti-fuite : l'employé de B n'apparaît jamais dans le scope de A.
    expect(empsA.some((e) => e.id === employeB.id)).toBe(false);
  });

  test("getDocumentsClient : aucun document du client B", async () => {
    const docsA = await getDocumentsClient(cabinet.id, clientA.id);
    expect(docsA.length).toBeGreaterThanOrEqual(1);
    expect(docsA.some((d) => d.id === documentA.id)).toBe(true);
    expect(docsA.some((d) => d.id === documentB.id)).toBe(false);
  });

  test("listerPeriodesClient : aucune période du client B", async () => {
    const persA = await listerPeriodesClient(cabinet.id, clientA.id);
    expect(persA.length).toBeGreaterThanOrEqual(1);
    expect(persA.some((p) => p.id === periodeA.id)).toBe(true);
    expect(persA.some((p) => p.id === periodeB.id)).toBe(false);
  });
});

// ─── Spot-check symétrique : client B ne voit pas client A ──────────────────

describe("client_contact B ne voit pas les données du client A (symétrie)", () => {
  test("getEmployesClient(B) ne contient pas l'employé de A", async () => {
    const empsB = await getEmployesClient(cabinet.id, clientB.id);
    expect(empsB.some((e) => e.id === employeB.id)).toBe(true);
    expect(empsB.some((e) => e.id === employeA.id)).toBe(false);
  });

  test("getDocumentsClient(B) ne contient pas le document de A", async () => {
    const docsB = await getDocumentsClient(cabinet.id, clientB.id);
    expect(docsB.some((d) => d.id === documentB.id)).toBe(true);
    expect(docsB.some((d) => d.id === documentA.id)).toBe(false);
  });

  test("listerPeriodesClient(B) ne contient pas la période de A", async () => {
    const persB = await listerPeriodesClient(cabinet.id, clientB.id);
    expect(persB.some((p) => p.id === periodeB.id)).toBe(true);
    expect(persB.some((p) => p.id === periodeA.id)).toBe(false);
  });
});

// ─── Bonus cross-cabinet : un client d'un cabinet ne voit pas l'autre cabinet ─

describe("cross-cabinet : le scope d'un cabinet ne résout pas un client d'un autre cabinet", () => {
  test("getEntrepriseClient(cabinet, clientAutreCabinet) renvoie null", async () => {
    expect(await getEntrepriseClient(cabinet.id, clientAutreCabinet.id)).toBeNull();
  });

  test("getEmployesClient avec un client_id d'un autre cabinet est vide", async () => {
    // Même si on passe le bon cabinet du client cible mais le mauvais (croisé), aucun résultat.
    expect(await getEmployesClient(cabinet.id, clientAutreCabinet.id)).toHaveLength(0);
    expect(await getEmployesClient(autreCabinet.id, clientA.id)).toHaveLength(0);
  });

  test("listerPeriodesClient avec un couple (cabinet, client) croisé est vide", async () => {
    expect(await listerPeriodesClient(autreCabinet.id, clientA.id)).toHaveLength(0);
  });
});
