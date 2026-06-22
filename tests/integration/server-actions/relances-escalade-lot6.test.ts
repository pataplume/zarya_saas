/**
 * Tests de l'escalade des relances — @zarya/calendar escaladerRelances (Lot 6, ADR 0025 §5).
 *
 * Couvre la suite de la série de relances (Mode A — uniquement des brouillons) :
 *  - escalade nominale : échéance encore `en_retard`, relance n°1 ENVOYÉE et MÛRE
 *    (> délai) → crée un brouillon n°2 ;
 *  - délai non écoulé : relance trop récente → aucune escalade ;
 *  - politique d'arrêt : `numero_dans_serie` >= maxRelances → aucun brouillon, compteur
 *    `arretees_max` ;
 *  - brouillon en cours : une relance déjà en brouillon bloque l'escalade (la précédente
 *    doit être traitée) ;
 *  - réponse reçue : une relance `repondue` (ou `reponse_recue_le`) arrête la série ;
 *  - isolation : escalade scopée cabinet → un autre cabinet n'est jamais touché.
 *
 * Chaque test crée son propre modèle de relance cabinet-scopé (indépendant du seed global).
 */
import { randomUUID } from "node:crypto";
import { escaladerRelances } from "@zarya/calendar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const sql = createServiceClient();

/** Échéance en retard avec un libellé contrôlé. */
async function insertEcheanceEnRetard(cabinet_id: string, client_id: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.echeance (id, cabinet_id, client_id, type, libelle, date_echeance, statut)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'tva',
            ${`Échéance escalade ${id.slice(0, 8)}`},
            (current_date - interval '30 days')::date, 'en_retard')
  `;
  return id;
}

/** Contact principal (destinataire). */
async function insertContactPrincipal(cabinet_id: string, client_id: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.contact (id, cabinet_id, client_id, nom, email, est_principal)
    VALUES (${id}, ${cabinet_id}, ${client_id}, 'Dupont', 'dupont@example.test', true)
  `;
  return id;
}

/** Modèle de relance cabinet-scopé pour le type tva (override → indépendant du seed). */
async function insertModele(cabinet_id: string): Promise<void> {
  await sql`
    INSERT INTO calendar.modele_relance (cabinet_id, type_echeance, langue, nom, objet, corps)
    VALUES (${cabinet_id}, 'tva', 'fr', ${`Modele ${randomUUID().slice(0, 8)}`},
            'Relance {{echeance_libelle}}', 'Bonjour {{client_nom}}, merci.')
    ON CONFLICT (cabinet_id, type_echeance, langue) WHERE cabinet_id IS NOT NULL
    DO NOTHING
  `;
}

/** Relance ENVOYÉE de rang `numero`, date_envoi décalée de `envoyeIlYaJours` jours. */
async function insertRelanceEnvoyee(
  cabinet_id: string,
  client_id: string,
  echeance_id: string,
  contact_id: string,
  numero: number,
  envoyeIlYaJours: number,
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.relance
      (id, cabinet_id, client_id, echeance_id, destinataire_contact_id, canal,
       sujet, corps, statut, numero_dans_serie, date_envoi)
    VALUES (${id}, ${cabinet_id}, ${client_id}, ${echeance_id}, ${contact_id}, 'email',
            'Sujet', 'Corps', 'envoyee', ${numero},
            (current_timestamp - make_interval(days => ${envoyeIlYaJours})))
  `;
  return id;
}

async function brouillonsFor(echeance_id: string) {
  return sql`
    SELECT id, numero_dans_serie, statut::text AS statut
    FROM crm.relance WHERE echeance_id = ${echeance_id} AND statut = 'brouillon'
    ORDER BY numero_dans_serie
  `;
}

describe("Escalade des relances — escaladerRelances (Lot 6)", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    await insertModele(cabinetA.id);
    await insertModele(cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("nominal : relance n°1 envoyée et mûre → brouillon n°2 créé", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const ct = await insertContactPrincipal(cabinetA.id, c.id);
    const e = await insertEcheanceEnRetard(cabinetA.id, c.id);
    await insertRelanceEnvoyee(cabinetA.id, c.id, e, ct, 1, 10);

    const res = await escaladerRelances({
      cabinetId: cabinetA.id,
      maxRelances: 3,
      delaiEntreRelancesJours: 7,
    });
    expect(res.brouillons_crees).toBeGreaterThanOrEqual(1);

    const brouillons = await brouillonsFor(e);
    expect(brouillons).toHaveLength(1);
    expect(brouillons[0]?.numero_dans_serie).toBe(2);
  });

  test("délai non écoulé : relance trop récente → aucune escalade", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const ct = await insertContactPrincipal(cabinetA.id, c.id);
    const e = await insertEcheanceEnRetard(cabinetA.id, c.id);
    await insertRelanceEnvoyee(cabinetA.id, c.id, e, ct, 1, 2); // 2 jours < 7

    await escaladerRelances({ cabinetId: cabinetA.id, delaiEntreRelancesJours: 7 });
    expect(await brouillonsFor(e)).toHaveLength(0);
  });

  test("politique d'arrêt : numero_dans_serie atteint maxRelances → pas de brouillon", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const ct = await insertContactPrincipal(cabinetA.id, c.id);
    const e = await insertEcheanceEnRetard(cabinetA.id, c.id);
    // 3 relances déjà envoyées (rang max = 3), maxRelances = 3 → arrêt.
    await insertRelanceEnvoyee(cabinetA.id, c.id, e, ct, 3, 20);

    const res = await escaladerRelances({
      cabinetId: cabinetA.id,
      maxRelances: 3,
      delaiEntreRelancesJours: 7,
    });
    expect(await brouillonsFor(e)).toHaveLength(0);
    expect(res.arretees_max).toBeGreaterThanOrEqual(1);
  });

  test("brouillon en cours : une relance brouillon bloque l'escalade", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const ct = await insertContactPrincipal(cabinetA.id, c.id);
    const e = await insertEcheanceEnRetard(cabinetA.id, c.id);
    await insertRelanceEnvoyee(cabinetA.id, c.id, e, ct, 1, 10);
    // Un brouillon n°2 déjà en attente de validation.
    await sql`
      INSERT INTO crm.relance
        (cabinet_id, client_id, echeance_id, destinataire_contact_id, canal,
         sujet, corps, statut, numero_dans_serie)
      VALUES (${cabinetA.id}, ${c.id}, ${e}, ${ct}, 'email', 'S', 'C', 'brouillon', 2)
    `;

    await escaladerRelances({ cabinetId: cabinetA.id, delaiEntreRelancesJours: 7 });
    // Toujours un seul brouillon (pas de n°3 créé tant que le n°2 n'est pas traité).
    expect(await brouillonsFor(e)).toHaveLength(1);
  });

  test("réponse reçue : une relance répondue arrête la série", async () => {
    const c = await seedClient(sql, cabinetA.id);
    const ct = await insertContactPrincipal(cabinetA.id, c.id);
    const e = await insertEcheanceEnRetard(cabinetA.id, c.id);
    await insertRelanceEnvoyee(cabinetA.id, c.id, e, ct, 1, 10);
    await sql`
      INSERT INTO crm.relance
        (cabinet_id, client_id, echeance_id, destinataire_contact_id, canal,
         sujet, corps, statut, numero_dans_serie, reponse_recue_le)
      VALUES (${cabinetA.id}, ${c.id}, ${e}, ${ct}, 'email', 'S', 'C', 'repondue', 1,
              current_timestamp)
    `;

    await escaladerRelances({ cabinetId: cabinetA.id, delaiEntreRelancesJours: 7 });
    expect(await brouillonsFor(e)).toHaveLength(0);
  });

  test("isolation : escalade scopée cabinet A ne touche jamais le cabinet B", async () => {
    const cB = await seedClient(sql, cabinetB.id);
    const ctB = await insertContactPrincipal(cabinetB.id, cB.id);
    const eB = await insertEcheanceEnRetard(cabinetB.id, cB.id);
    await insertRelanceEnvoyee(cabinetB.id, cB.id, eB, ctB, 1, 10);

    // Escalade scopée cabinet A : l'échéance du cabinet B n'est pas escaladée.
    await escaladerRelances({ cabinetId: cabinetA.id, delaiEntreRelancesJours: 7 });
    expect(await brouillonsFor(eB)).toHaveLength(0);

    // Escalade scopée cabinet B : cette fois B est servi.
    const res = await escaladerRelances({ cabinetId: cabinetB.id, delaiEntreRelancesJours: 7 });
    expect(res.brouillons_crees).toBeGreaterThanOrEqual(1);
    expect(await brouillonsFor(eB)).toHaveLength(1);
  });
});
