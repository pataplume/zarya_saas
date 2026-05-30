/**
 * Tests de la génération automatique des échéances — module Calendar, Run 6 (C1).
 *
 * Couvre la fonction système calendar.fn_generer_echeances(p_cabinet_id,
 * p_horizon_mois, p_today) : matérialisation des crm.echeance récurrentes à partir
 * des services actifs + régime TVA du client via calendar.template_echeance
 * (globaux + overrides), avec idempotence et filtres métier.
 *
 * Règles testées (DoD C1, ADR 0016) :
 *  - génération nominale (fréquence mensuelle, dates + date_alerte + libellé) ;
 *  - idempotence (un 2e passage ne crée aucun doublon) ;
 *  - filtre service_requis (client sans le service requis → rien) ;
 *  - filtre regime_tva (effective vs forfait — lu dans service.parametres) ;
 *  - filtre canton_specifique (fédéral NULL vs canton précis) ;
 *  - override cabinet supplante le template global parent (herite_de_id) ;
 *  - jour_du_mois NULL → dernier jour du mois ;
 *  - scope p_cabinet_id : un autre cabinet n'est jamais généré (anti-fuite).
 *
 * Isolation : chaque test crée ses propres templates (cabinet-scopés sauf le test
 * d'override) et n'asserte QUE ses lignes (filtrées par template_id) — le catalogue
 * global génère aussi des échéances pour les clients matchants, c'est attendu.
 * Les templates globaux créés ici (test override) sont nettoyés en afterAll.
 *
 * Références :
 *  - packages/db/migrations/0023_calendar_generer_echeances.sql
 *  - docs/architecture/decisions/0016-sequencement-calendar-microsoft-graph.md
 *  - docs/architecture/decisions/0011-calendar-mvp-scope.md ; KICKOFF §C/C1
 */
import { randomUUID } from "node:crypto";
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

/** Insère un crm.service actif (avec parametres optionnels, ex. regime_tva). */
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

/** Insère une crm.adresse de siège portant un canton (source du canton fiscal). */
async function insertAdresse(cabinet_id: string, client_id: string, canton: string): Promise<void> {
  await sql`
    INSERT INTO crm.adresse (id, cabinet_id, client_id, type, canton, est_principale)
    VALUES (${randomUUID()}, ${cabinet_id}, ${client_id}, 'siege', ${canton}, true)
  `;
}

type TemplateChamps = {
  cabinet_id: string | null;
  type_echeance?: string;
  frequence: string;
  service_requis?: string[] | null;
  canton_specifique?: string[] | null;
  regime_tva?: string[] | null;
  jour_du_mois?: number | null;
  mois_dans_annee?: number[] | null;
  date_specifique?: string | null;
  delai_alerte_jours?: number;
  herite_de_id?: string | null;
};

/** Insère un calendar.template_echeance (global si cabinet_id null, sinon override). */
async function insertTemplate(c: TemplateChamps): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO calendar.template_echeance
      (id, cabinet_id, nom, type_echeance, frequence, service_requis, canton_specifique,
       regime_tva, jour_du_mois, mois_dans_annee, date_specifique, delai_alerte_jours,
       herite_de_id, actif)
    VALUES (
      ${id}, ${c.cabinet_id}, ${`Test ${id.slice(0, 8)}`}, ${c.type_echeance ?? "personnalisee"},
      ${c.frequence}, ${c.service_requis ?? null}, ${c.canton_specifique ?? null},
      ${c.regime_tva ?? null}, ${c.jour_du_mois ?? null}, ${c.mois_dans_annee ?? null},
      ${c.date_specifique ?? null}, ${c.delai_alerte_jours ?? 7}, ${c.herite_de_id ?? null}, true
    )
  `;
  return id;
}

/** Exécute la génération (service role) et retourne le nombre d'échéances créées. */
async function gen(cabinet_id: string | null, horizonMois: number, today: string): Promise<number> {
  const [r] = await sql`
    SELECT calendar.fn_generer_echeances(${cabinet_id}::uuid, ${horizonMois}, ${today}::date) AS n
  `;
  return Number(r?.n);
}

/** Échéances générées par un template donné, triées par date. */
async function echeancesFor(template_id: string) {
  return sql`
    SELECT date_echeance::text, date_alerte::text, libelle, type, statut, service_id
    FROM crm.echeance WHERE template_id = ${template_id}
    ORDER BY date_echeance
  `;
}

describe("Génération automatique des échéances — module Calendar (Run 6 / C1)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  const globalTemplateIds: string[] = [];

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
  });

  afterAll(async () => {
    // Nettoie les templates GLOBAUX (cabinet_id NULL) créés ici : cleanupCabinets
    // ne les couvre pas (ils n'ont pas de cabinet_id).
    if (globalTemplateIds.length > 0) {
      await sql`DELETE FROM crm.echeance WHERE template_id = ANY(${globalTemplateIds})`;
      await sql`DELETE FROM calendar.template_echeance WHERE id = ANY(${globalTemplateIds})`;
    }
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("nominal : un template mensuel génère une échéance par mois de l'horizon", async () => {
    const serviceId = await insertService(cabinetA.id, clientA.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "relance_documents",
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 25,
      delai_alerte_jours: 7,
    });

    const n = await gen(cabinetA.id, 3, "2026-03-10");
    expect(n).toBeGreaterThan(0);

    const rows = await echeancesFor(tpl);
    // Horizon = mars→juin (date_trunc + 3 mois) ; le 25 de juin (> 1er juin) est exclu.
    expect(rows.map((r) => r.date_echeance)).toEqual(["2026-03-25", "2026-04-25", "2026-05-25"]);
    expect(rows[0]?.date_alerte).toBe("2026-03-18"); // échéance - 7 jours
    expect(rows[0]?.libelle).toContain("(03.2026)");
    expect(rows[0]?.statut).toBe("a_venir");
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

    await gen(cabinetA.id, 2, "2026-03-10");
    const apres1 = (await echeancesFor(tpl)).length;
    expect(apres1).toBeGreaterThan(0);

    const n2 = await gen(cabinetA.id, 2, "2026-03-10");
    expect(n2).toBe(0); // tout existe déjà
    expect((await echeancesFor(tpl)).length).toBe(apres1);
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

    await gen(cabinetA.id, 3, "2026-03-10");
    expect(await echeancesFor(tpl)).toHaveLength(0);
  });

  test("filtre regime_tva : seul le client au bon régime (service.parametres) matche", async () => {
    const cMatch = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, cMatch.id, "comptabilite", {
      regime_tva: "effective_trimestre",
    });
    const cNo = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, cNo.id, "comptabilite", { regime_tva: "forfaitaire_annuel" });

    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "tva",
      frequence: "trimestrielle",
      service_requis: ["comptabilite"],
      regime_tva: ["effective_trimestre"],
      mois_dans_annee: [2, 5, 8, 11],
      jour_du_mois: 14,
    });

    await gen(cabinetA.id, 12, "2026-01-05");
    const rows = await echeancesFor(tpl);
    const clientIds = new Set(
      (await sql`SELECT client_id FROM crm.echeance WHERE template_id = ${tpl}`).map(
        (r) => r.client_id,
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(clientIds.has(cMatch.id)).toBe(true);
    expect(clientIds.has(cNo.id)).toBe(false); // régime forfaitaire exclu
  });

  test("filtre canton_specifique : seul le canton listé matche", async () => {
    const cVd = await seedClient(sql, cabinetA.id);
    await insertAdresse(cabinetA.id, cVd.id, "VD"); // canton fiscal = siège
    await insertService(cabinetA.id, cVd.id, "comptabilite");
    const cGe = await seedClient(sql, cabinetA.id);
    await insertAdresse(cabinetA.id, cGe.id, "GE");
    await insertService(cabinetA.id, cGe.id, "comptabilite");

    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      canton_specifique: ["VD"],
      jour_du_mois: 15,
    });

    await gen(cabinetA.id, 2, "2026-03-10");
    const clientIds = new Set(
      (await sql`SELECT client_id FROM crm.echeance WHERE template_id = ${tpl}`).map(
        (r) => r.client_id,
      ),
    );
    expect(clientIds.has(cVd.id)).toBe(true);
    expect(clientIds.has(cGe.id)).toBe(false);
  });

  test("override cabinet : un template propre supplante son parent global (herite_de_id)", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");

    const tGlobal = await insertTemplate({
      cabinet_id: null,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 5,
    });
    globalTemplateIds.push(tGlobal);
    const tOverride = await insertTemplate({
      cabinet_id: cabinetA.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 20,
      herite_de_id: tGlobal,
    });

    await gen(cabinetA.id, 2, "2026-03-10");

    // L'override produit des échéances ; le parent global n'en produit AUCUNE pour ce cabinet.
    expect((await echeancesFor(tOverride)).length).toBeGreaterThan(0);
    expect(await echeancesFor(tGlobal)).toHaveLength(0);
  });

  test("jour_du_mois NULL → dernier jour du mois", async () => {
    const c = await seedClient(sql, cabinetA.id);
    await insertService(cabinetA.id, c.id, "comptabilite");
    const tpl = await insertTemplate({
      cabinet_id: cabinetA.id,
      type_echeance: "tva",
      frequence: "annuelle",
      service_requis: ["comptabilite"],
      mois_dans_annee: [2],
      jour_du_mois: null,
    });

    await gen(cabinetA.id, 3, "2026-01-05");
    // Scopé à CE client : le template (cabinet-A, service comptabilite) matche aussi
    // les autres clients comptabilité créés par les tests précédents.
    const rows = await sql`
      SELECT date_echeance::text FROM crm.echeance
      WHERE template_id = ${tpl} AND client_id = ${c.id}
      ORDER BY date_echeance
    `;
    expect(rows.map((r) => r.date_echeance)).toEqual(["2026-02-28"]); // février 2026 non bissextile
  });

  test("scope p_cabinet_id : un autre cabinet n'est jamais généré (anti-fuite)", async () => {
    await insertService(cabinetB.id, clientB.id, "comptabilite");
    const tplB = await insertTemplate({
      cabinet_id: cabinetB.id,
      frequence: "mensuelle",
      service_requis: ["comptabilite"],
      jour_du_mois: 12,
    });

    // Génération scopée cabinet A → le template/échéances de B restent vides.
    await gen(cabinetA.id, 3, "2026-03-10");
    expect(await echeancesFor(tplB)).toHaveLength(0);

    // Génération scopée cabinet B → cette fois B est servi.
    await gen(cabinetB.id, 3, "2026-03-10");
    expect((await echeancesFor(tplB)).length).toBeGreaterThan(0);
  });
});
