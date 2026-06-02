/**
 * E6 — Export comptable des factures validées (exporterFacturesValidees).
 *
 * Couvre le chemin RÉEL contre la base de test :
 *  - génère un CSV des factures `validee` du cabinet ;
 *  - bascule leur statut en `exportee` (mode lot) ;
 *  - scope cabinet (anti-fuite) : les factures d'un autre cabinet ne sont ni exportées ni touchées ;
 *  - n'expose jamais d'IBAN dans le CSV.
 *
 * Les factures validées sont créées via le vrai `finaliserFacture` (E5a). Aucune I/O réseau.
 *
 * Références : KICKOFF § BLOC E / E6 · facture.md §7.
 */
import { exporterFacturesValidees, finaliserFacture } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedPropositionFacture,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
const IBAN = "CH9300762011623852957";

let cabinetA: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let clientB: TestClient;

beforeAll(async () => {
  const s = await seedTwoCabinets(sql);
  cabinetA = s.cabinetA;
  cabinetB = s.cabinetB;
  clientA = await seedClient(sql, cabinetA.id);
  clientB = await seedClient(sql, cabinetB.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
  await sql.end();
});

async function validerUneFacture(
  cabinet: TestCabinet,
  clientId: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const prop = await seedPropositionFacture(sql, cabinet.id, clientId);
  const r = await finaliserFacture({
    cabinet_id: cabinet.id,
    client_id: clientId,
    proposition_id: prop.id,
    fournisseur: { raison_sociale: "Swisscom SA", ide: "CHE-116.281.710", iban: IBAN },
    numero_facture: `F-${prop.id.slice(0, 8)}`,
    date_emission: "2026-04-15",
    total_ht: 100,
    total_tva: 8.1,
    total_ttc: 108.1,
    montant_a_payer: 108.1,
    taux_tva_principal: 8.1,
    compte_charge: "6000",
    acteur_id: cabinet.user_id,
    ...over,
  });
  return r.facture_id;
}

describe("E6 — exporterFacturesValidees", () => {
  test("exporte les factures validee, bascule en exportee, anti-fuite, sans IBAN", async () => {
    const factA = await validerUneFacture(cabinetA, clientA.id);
    const factB = await validerUneFacture(cabinetB, clientB.id);

    const res = await exporterFacturesValidees(cabinetA.id);
    expect(res.count).toBe(1);
    expect(res.facture_ids).toContain(factA);
    expect(res.csv).toContain("Swisscom SA");
    expect(res.csv).toContain("108.10");
    expect(res.csv.toUpperCase()).not.toContain(IBAN); // jamais d'IBAN exporté

    // La facture A est passée exportee ; celle de B (autre cabinet) est intacte.
    const [a] = await sql`SELECT statut FROM facture.facture WHERE id = ${factA}`;
    expect(a?.statut).toBe("exportee");
    const [b] = await sql`SELECT statut FROM facture.facture WHERE id = ${factB}`;
    expect(b?.statut).toBe("validee");
  });

  test("2e export sans nouvelle facture → count 0 (les exportee ne ressortent pas)", async () => {
    const res = await exporterFacturesValidees(cabinetA.id);
    expect(res.count).toBe(0);
    expect(res.csv).toContain("Date;Fournisseur"); // en-têtes seules
  });
});
