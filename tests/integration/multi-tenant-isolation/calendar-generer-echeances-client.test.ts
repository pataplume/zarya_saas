/**
 * Tests du moteur d'échéances PAR CLIENT — @zarya/calendar genererEcheancesPourClient
 * (Lot 2, ADR 0025 / achèvement ADR 0011 Run 6).
 *
 * Couvre la génération initiale déclenchée à l'activation/maj d'un service :
 *  - nominal (TVA trimestrielle : dates Q1-Q4 + date_alerte + libellé + service_id) ;
 *  - idempotence (un 2e passage ne crée aucun doublon) ;
 *  - re-génération après modification d'un service (sans détruire l'historique traité) ;
 *  - instanciation de crm.document_attendu dans documents_requis (cohérence migration 0029) ;
 *  - filtre service_requis (client sans le service requis → rien) ;
 *  - isolation / anti-fuite : un client d'un autre cabinet n'est jamais généré.
 *
 * Le moteur TS reproduit la sémantique de calendar.fn_generer_echeances (SQL) ; chaque test
 * crée ses propres templates cabinet-scopés et n'asserte QUE ses lignes (filtrées par
 * template_id) — le catalogue global génère aussi pour les clients matchants, c'est attendu.
 *
 * Références :
 *  - packages/calendar/src/echeance/{catalogue,generer}.ts
 *  - packages/db/migrations/0023_calendar_generer_echeances.sql (sémantique SQL miroir)
 *  - ADR 0025, PLAN-ONBOARDING-CLIENT.md §5/Annexe
 */
import { randomUUID } from "node:crypto";
import { genererEcheancesPourClient } from "@zarya/calendar";
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

type TypeService = "comptabilite" | "fiscalite" | "salaires" | "tva" | "bouclement" | "conseil";

async function insertService(
  cabinet_id: string,
  client_id: string,
  type: TypeService,
  parametres?: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.service (id, cabinet_id, client_id, type, actif, parametres)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${type}, true,
            ${parametres ? sql.json(parametres) : null})
  `;
  return id;
}

type TemplateChamps = {
  cabinet_id: string;
  type_echeance?: string;
  frequence: string;
  service_requis?: string[] | null;
  regime_tva?: string[] | null;
  jour_du_mois?: number | null;
  mois_dans_annee?: number[] | null;
  delai_alerte_jours?: number;
  documents_requis_types?: string[] | null;
};

async function insertTemplate(c: TemplateChamps): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.template_echeance
      (id, cabinet_id, nom, type_echeance, frequence, service_requis, regime_tva,
       jour_du_mois, mois_dans_annee, delai_alerte_jours, documents_requis_types, actif)
    VALUES (
      ${id}, ${c.cabinet_id}, ${`Test ${id.slice(0, 8)}`}, ${c.type_echeance ?? "personnalisee"},
      ${c.frequence}, ${c.service_requis ?? null}, ${c.regime_tva ?? null},
      ${c.jour_du_mois ?? null}, ${c.mois_dans_annee ?? null}, ${c.delai_alerte_jours ?? 7},
      ${c.documents_requis_types ?? null}, true
    )
  `;
  return id;
}

async function echeancesFor(template_id: string, client_id: string) {
  return sql`
    SELECT date_echeance::text, date_alerte::text, libelle, type, statut, service_id, documents_requis
    FROM crm.echeance WHERE template_id = ${template_id} AND client_id = ${client_id}
    ORDER BY date_echeance
  `;
}

describe("Moteur d'échéances par client — genererEcheancesPourClient (Lot 2)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("nominal : TVA trimestrielle → 4 échéances Q1-Q4 (fin 2e mois) + alerte + libellé", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const serviceId = await insertService(cabinetA.id, c.id, "comptabilite", {
      regime_tva: "effective_trimestre",
    });
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "tva",
      frequence: "trimestrielle",
      service_requis: ["comptabilite"],
      regime_tva: ["effective_trimestre"],
      mois_dans_annee: [2, 5, 8, 11],
      jour_du_mois: null,
      delai_alerte_jours: 14,
    });

    const res = await genererEcheancesPourClient(cabinetA.id, c.id, {
      today: "2026-01-05",
      horizonMois: 12,
    });
    expect(res.echeances_creees).toBeGreaterThanOrEqual(4);

    const rows = await echeancesFor(tpl, c.id);
    expect(rows.map((r) => r.date_echeance)).toEqual([
      "2026-02-28",
      "2026-05-31",
      "2026-08-31",
      "2026-11-30",
    ]);
    expect(rows[0]?.date_alerte).toBe("2026-02-14");
    expect(rows[0]?.type).toBe("tva");
    expect(rows[0]?.statut).toBe("a_venir");
    expect(rows[0]?.libelle).toContain("(02.2026)");
    expect(rows[0]?.service_id).toBe(serviceId);
  });

  test("idempotence : un 2e passage ne crée aucun doublon", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 10,
    });

    const r1 = await genererEcheancesPourClient(cabinetA.id, c.id, {
      today: "2026-03-10",
      horizonMois: 2,
    });
    expect(r1.echeances_creees).toBeGreaterThan(0);
    const apres1 = (await echeancesFor(tpl, c.id)).length;

    const r2 = await genererEcheancesPourClient(cabinetA.id, c.id, {
      today: "2026-03-10",
      horizonMois: 2,
    });
    expect(r2.echeances_creees).toBe(0);
    expect((await echeancesFor(tpl, c.id)).length).toBe(apres1);
  });

  test("re-génération après modif service : ne détruit pas l'historique traité", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 15,
    });

    await genererEcheancesPourClient(cabinetA.id, c.id, { today: "2026-03-10", horizonMois: 3 });
    // On "traite" la 1re échéance (simule un suivi métier).
    const [premiere] = await echeancesFor(tpl, c.id);
    await sql`UPDATE crm.echeance SET statut = 'traitee' WHERE template_id = ${tpl}
              AND client_id = ${c.id} AND date_echeance = ${premiere?.date_echeance}::date`;

    // Re-génération : la ligne traitée reste intacte (idempotence sur date), pas de doublon.
    await genererEcheancesPourClient(cabinetA.id, c.id, { today: "2026-03-10", horizonMois: 3 });
    const rows = await echeancesFor(tpl, c.id);
    const traitees = rows.filter((r) => r.statut === "traitee");
    expect(traitees).toHaveLength(1);
    // Aucun doublon de la date traitée.
    const memeDate = rows.filter((r) => r.date_echeance === premiere?.date_echeance);
    expect(memeDate).toHaveLength(1);
  });

  test("documents_requis : les document_attendu du bon type sont rattachés", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    // Un document attendu de type 'releve_bancaire' pour ce client.
    const daId = randomUUID();
    await sql`
      INSERT INTO crm.document_attendu (id, cabinet_id, client_id, type_document, frequence)
      VALUES (${daId}, ${cabinetA.id}, ${c.id}, 'releve_bancaire', 'mensuelle')
    `;
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "relance_documents",
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 5,
      documents_requis_types: ["releve_bancaire"],
    });

    await genererEcheancesPourClient(cabinetA.id, c.id, { today: "2026-03-10", horizonMois: 1 });
    const rows = await echeancesFor(tpl, c.id);
    expect(rows.length).toBeGreaterThan(0);
    const docs = rows[0]?.documents_requis as string[] | null;
    expect(docs).not.toBeNull();
    expect(docs).toContain(daId);
  });

  test("filtre service_requis : un client sans le service requis n'a rien", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite"); // pas 'salaires'
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "salaire",
      frequence: "mensuelle",
      service_requis: ["salaires"],
      jour_du_mois: 25,
    });

    await genererEcheancesPourClient(cabinetA.id, c.id, { today: "2026-03-10", horizonMois: 3 });
    expect(await echeancesFor(tpl, c.id)).toHaveLength(0);
  });

  test("isolation : générer pour un client n'affecte jamais un autre cabinet (anti-fuite)", async () => {
    await insertService(cabinetB.id, clientB.id, "comptabilite");
    const tplB = await insertTemplate({
      cabinet_id: cabinetB.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 12,
    });

    // Génération demandée pour le client B mais en passant le cabinet A (mismatch) :
    // la garde d'appartenance refuse → rien généré.
    const refus = await genererEcheancesPourClient(cabinetA.id, clientB.id, {
      today: "2026-03-10",
      horizonMois: 3,
    });
    expect(refus.echeances_creees).toBe(0);
    expect(refus.templates_applicables).toBe(0);
    expect(await echeancesFor(tplB, clientB.id)).toHaveLength(0);

    // Génération correcte (cabinet B, client B) → cette fois B est servi.
    const ok = await genererEcheancesPourClient(cabinetB.id, clientB.id, {
      today: "2026-03-10",
      horizonMois: 3,
    });
    expect(ok.echeances_creees).toBeGreaterThan(0);
    expect((await echeancesFor(tplB, clientB.id)).length).toBeGreaterThan(0);

    // Le client A n'a reçu aucune échéance de ce template cabinet-B.
    expect(await echeancesFor(tplB, clientA.id)).toHaveLength(0);
  });
});
