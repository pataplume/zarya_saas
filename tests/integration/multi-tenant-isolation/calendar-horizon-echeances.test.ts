/**
 * Tests du cron « horizon » des échéances — @zarya/calendar roulerHorizonEcheances
 * (Lot 6, ADR 0025 / achèvement ADR 0011 Run 6).
 *
 * Couvre le roulement de l'horizon roulant (job système, tous clients) :
 *  - idempotence : un 2e passage à la même date ne crée AUCUN doublon ;
 *  - roll-forward : une occurrence qui n'entrait pas dans l'horizon initial est créée
 *    lorsqu'une date ultérieure (`today`) la fait entrer dans la fenêtre [today, today+N] ;
 *  - scoping cabinet : `cabinetId` ne traite que les clients de ce cabinet ;
 *  - isolation : aucune échéance n'est créée pour un client d'un autre cabinet.
 *
 * Le cron réutilise genererEcheancesPourClient (Lot 2) → MÊME clé d'idempotence
 * (client_id, template_id, date_echeance). Chaque test crée ses propres templates
 * cabinet-scopés et n'asserte QUE ses lignes (filtrées par template_id).
 */
import { randomUUID } from "node:crypto";
import { roulerHorizonEcheances } from "@zarya/calendar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();

async function insertService(cabinet_id: string, client_id: string, type: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.service (id, cabinet_id, client_id, type, actif)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${type}, true)
  `;
  return id;
}

async function insertTemplate(c: {
  cabinet_id: string;
  frequence: string;
  service_requis?: string[] | null;
  jour_du_mois?: number | null;
  mois_dans_annee?: number[] | null;
}): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.template_echeance
      (id, cabinet_id, nom, type_echeance, frequence, service_requis,
       jour_du_mois, mois_dans_annee, delai_alerte_jours, actif)
    VALUES (
      ${id}, ${c.cabinet_id}, ${`Horizon ${id.slice(0, 8)}`}, 'personnalisee',
      ${c.frequence}, ${c.service_requis ?? null},
      ${c.jour_du_mois ?? null}, ${c.mois_dans_annee ?? null}, 7, true
    )
  `;
  return id;
}

async function echeancesFor(template_id: string, client_id: string) {
  return sql`
    SELECT date_echeance::text
    FROM crm.echeance WHERE template_id = ${template_id} AND client_id = ${client_id}
    ORDER BY date_echeance
  `;
}

describe("Cron horizon — roulerHorizonEcheances (Lot 6)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("idempotence : un 2e passage à la même date ne crée aucun doublon", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 10,
    });

    const r1 = await roulerHorizonEcheances({
      cabinetId: cabinetA.id,
      today: "2026-03-10",
      horizonMois: 2,
    });
    expect(r1.echeances_creees).toBeGreaterThan(0);
    const apres1 = (await echeancesFor(tpl, c.id)).length;

    const r2 = await roulerHorizonEcheances({
      cabinetId: cabinetA.id,
      today: "2026-03-10",
      horizonMois: 2,
    });
    expect(r2.echeances_creees).toBe(0);
    expect((await echeancesFor(tpl, c.id)).length).toBe(apres1);
  });

  test("roll-forward : une occurrence hors horizon initial est créée à une date ultérieure", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 15,
    });

    // Horizon court (1 mois) au 2026-01-05 : couvre janv. + tout le mois cible (févr.).
    await roulerHorizonEcheances({ cabinetId: cabinetA.id, today: "2026-01-05", horizonMois: 1 });
    const dates1 = (await echeancesFor(tpl, c.id)).map((r) => r.date_echeance);
    expect(dates1).toContain("2026-01-15");
    expect(dates1).toContain("2026-02-15");
    // Mars n'entre pas encore dans l'horizon → absent.
    expect(dates1).not.toContain("2026-03-15");

    // Un mois plus tard, le même horizon roule : mars entre désormais dans la fenêtre.
    const r2 = await roulerHorizonEcheances({
      cabinetId: cabinetA.id,
      today: "2026-02-05",
      horizonMois: 1,
    });
    expect(r2.echeances_creees).toBeGreaterThan(0);
    const dates2 = (await echeancesFor(tpl, c.id)).map((r) => r.date_echeance);
    expect(dates2).toContain("2026-03-15");
    // Les anciennes restent (pas de doublon, pas de destruction).
    expect(dates2.filter((d) => d === "2026-02-15")).toHaveLength(1);
  });

  test("scoping cabinet : cabinetId ne traite que ses clients", async () => {
    const cA = await seedClient(sql, cabinetA.id);
    const cB = await seedClient(sql, cabinetB.id);
    await insertService(cabinetA.id, cA.id, "comptabilite");
    await insertService(cabinetB.id, cB.id, "comptabilite");
    const tplA = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 8,
    });
    const tplB = await insertTemplate({
      cabinet_id: cabinetB.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 8,
    });

    // Roulement scopé cabinet A : seul cA est servi pour tplA ; cB n'a rien de tplB.
    await roulerHorizonEcheances({ cabinetId: cabinetA.id, today: "2026-03-01", horizonMois: 1 });
    expect((await echeancesFor(tplA, cA.id)).length).toBeGreaterThan(0);
    expect(await echeancesFor(tplB, cB.id)).toHaveLength(0);

    // Roulement scopé cabinet B : cB est servi à son tour.
    await roulerHorizonEcheances({ cabinetId: cabinetB.id, today: "2026-03-01", horizonMois: 1 });
    expect((await echeancesFor(tplB, cB.id)).length).toBeGreaterThan(0);
    // Le template B n'a jamais touché le client A.
    expect(await echeancesFor(tplB, cA.id)).toHaveLength(0);
  });
});
