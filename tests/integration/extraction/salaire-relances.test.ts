/**
 * G5b — relances + escalade du cycle salaire (intégration DB réelle, sender mocké).
 *
 * Vérifie : génération de brouillons (échéance proche, non validée, 1/cycle, hors pause vacances),
 * escalade des périodes en retard, envoi tracé (validation humaine) + statut relancee. Réf §7.7.
 */

import { randomUUID } from "node:crypto";
import {
  envoyerRelanceSalaire,
  escaladerPeriodesEnRetard,
  genererBrouillonsRelancesSalaire,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let clientProche: TestClient; // échéance dans 3 j, en_attente → relance attendue
let clientPause: TestClient; // échéance proche mais en pause vacances → pas de relance
let clientRetard: TestClient; // échéance dépassée → escalade

// Crée une période dont l'échéance = CURRENT_DATE + offset ; annee/mois dérivés de cette
// échéance (respecte chk_periode_limite : date_limite >= 1er du mois). Retourne id+annee+mois.
async function periode(client_id: string, joursOffset: number, statut: string) {
  const id = randomUUID();
  const [r] = (await sql`
    INSERT INTO salaire.periode (id, cabinet_id, client_id, annee, mois, date_limite_validation, statut)
    VALUES (
      ${id}, ${cabinet.id}, ${client_id},
      EXTRACT(YEAR FROM (CURRENT_DATE + (${joursOffset} || ' days')::interval))::int,
      EXTRACT(MONTH FROM (CURRENT_DATE + (${joursOffset} || ' days')::interval))::int,
      (CURRENT_DATE + (${joursOffset} || ' days')::interval)::date,
      ${statut}::salaire.statut_periode
    )
    RETURNING id, annee, mois`) as unknown as Array<{ id: string; annee: number; mois: number }>;
  return { id, annee: Number(r?.annee), mois: Number(r?.mois) };
}

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  clientProche = await seedClient(sql, cabinet.id);
  clientPause = await seedClient(sql, cabinet.id);
  clientRetard = await seedClient(sql, cabinet.id);
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("genererBrouillonsRelancesSalaire (G5b)", () => {
  test("crée un brouillon pour l'échéance proche non validée, pas pour le client en pause", async () => {
    const pProche = await periode(clientProche.id, 3, "en_attente");
    await periode(clientPause.id, 3, "en_attente"); // même offset → même cycle
    // Pause vacances couvrant aujourd'hui pour clientPause.
    await sql`
      INSERT INTO calendar.pause_client (cabinet_id, client_id, date_debut, date_fin, actif)
      VALUES (${cabinet.id}, ${clientPause.id}, (CURRENT_DATE - interval '2 days')::date,
              (CURRENT_DATE + interval '10 days')::date, true)`;

    const res = await genererBrouillonsRelancesSalaire({
      annee: pProche.annee,
      mois: pProche.mois,
      cabinet_id: cabinet.id,
    });
    expect(res.brouillons_crees).toBe(1);

    const rel =
      await sql`SELECT periode_id, auto_generated, valide_par_humain FROM salaire.relance WHERE periode_id = ${pProche.id}`;
    expect(rel).toHaveLength(1);
    expect(rel[0]?.auto_generated).toBe(true);
    expect(rel[0]?.valide_par_humain).toBe(false);

    // 2e passage : idempotent (max 1/cycle).
    const res2 = await genererBrouillonsRelancesSalaire({
      annee: pProche.annee,
      mois: pProche.mois,
      cabinet_id: cabinet.id,
    });
    expect(res2.brouillons_crees).toBe(0);
  });
});

describe("escaladerPeriodesEnRetard (G5b)", () => {
  test("passe en en_retard les périodes échues non validées", async () => {
    const pRetard = await periode(clientRetard.id, -3, "en_attente");
    const res = await escaladerPeriodesEnRetard({
      annee: pRetard.annee,
      mois: pRetard.mois,
      cabinet_id: cabinet.id,
    });
    expect(res.escaladees).toBeGreaterThanOrEqual(1);
    const [p] = await sql`SELECT statut FROM salaire.periode WHERE id = ${pRetard.id}`;
    expect(p?.statut).toBe("en_retard");
    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${pRetard.id} AND type = 'statut_modifie'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });
});

describe("envoyerRelanceSalaire (G5b)", () => {
  test("envoi tracé (validation humaine) → relancee + idempotence", async () => {
    const clientEnvoi = await seedClient(sql, cabinet.id);
    const p = await periode(clientEnvoi.id, 3, "en_attente");
    const relId = randomUUID();
    await sql`
      INSERT INTO salaire.relance (id, cabinet_id, client_id, periode_id, numero, auto_generated, valide_par_humain)
      VALUES (${relId}, ${cabinet.id}, ${clientEnvoi.id}, ${p.id}, 1, true, false)`;

    const sender = {
      sendEmailTracked: vi.fn(async () => ({ messageId: "msg-123", internetMessageId: "<imid>" })),
    };
    const res = await envoyerRelanceSalaire({
      cabinet_id: cabinet.id,
      relance_id: relId,
      destinataire_email: "rh@acme.ch",
      sender,
    });
    expect(res.status).toBe("envoyee");
    expect(sender.sendEmailTracked).toHaveBeenCalled();

    const [r] =
      await sql`SELECT valide_par_humain, graph_message_id FROM salaire.relance WHERE id = ${relId}`;
    expect(r?.valide_par_humain).toBe(true);
    expect(r?.graph_message_id).toBe("msg-123");
    const [per] = await sql`SELECT statut FROM salaire.periode WHERE id = ${p.id}`;
    expect(per?.statut).toBe("relancee");

    // 2e envoi ignoré.
    const res2 = await envoyerRelanceSalaire({
      cabinet_id: cabinet.id,
      relance_id: relId,
      destinataire_email: "rh@acme.ch",
      sender,
    });
    expect(res2.status).toBe("ignoree");
  });
});
