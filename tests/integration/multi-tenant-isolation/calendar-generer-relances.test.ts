/**
 * Tests d'intégration — génération des brouillons de relance (Bloc C2a).
 *
 * Vérifie contre la base partagée : création d'un brouillon rendu pour une échéance due,
 * idempotence (pas de doublon), respect des pauses, et scope cabinet.
 *
 * Réf : packages/calendar/src/relance/generer.ts, migration 0027.
 */

import { randomUUID } from "node:crypto";
import { genererBrouillonsRelances } from "@zarya/calendar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Génération brouillons de relance — module Calendar (C2a)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientAId: string;
  let echeanceAId: string;
  const modeleGlobalId = randomUUID();

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientAId = (await seedClient(sql, cabinetA.id)).id;

    // Contact principal (destinataire).
    await sql`
      INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal, email)
      VALUES (${cabinetA.id}, ${clientAId}, 'Dupont', true, 'dest@pme.ch')
    `;
    // Échéance TVA imminente.
    const [e] = await sql<{ id: string }[]>`
      INSERT INTO crm.echeance (cabinet_id, client_id, type, libelle, date_echeance, statut)
      VALUES (${cabinetA.id}, ${clientAId}, 'tva', 'TVA Q1 2026',
              CURRENT_DATE + 5, 'imminente')
      RETURNING id
    `;
    echeanceAId = e?.id ?? "";
    // Modèle de relance OVERRIDE cabinet (un global tva/fr existe déjà — seed 0008 —
    // avec contrainte unique partielle ; l'override par cabinet est prioritaire et teste
    // ce chemin).
    await sql`
      INSERT INTO calendar.modele_relance
        (id, cabinet_id, type_echeance, langue, nom, objet, corps, numero_relance)
      VALUES (${modeleGlobalId}, ${cabinetA.id}, 'tva', 'fr', 'Rappel TVA',
              ${"Rappel — {{echeance_libelle}}"},
              ${"Bonjour {{client_nom}}, échéance {{echeance_libelle}} au {{date_echeance}}. {{cabinet_nom}}"},
              1)
    `;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql`DELETE FROM calendar.modele_relance WHERE id = ${modeleGlobalId}`;
    await sql.end();
  });

  test("crée un brouillon rendu pour l'échéance due, scopé au cabinet", async () => {
    const res = await genererBrouillonsRelances({ cabinetId: cabinetA.id });
    expect(res.brouillons_crees).toBe(1);
    expect(res.sans_modele).toBe(0);

    const [row] = await sql<{ statut: string; sujet: string; corps: string }[]>`
      SELECT statut, sujet, corps FROM crm.relance WHERE echeance_id = ${echeanceAId}
    `;
    expect(row?.statut).toBe("brouillon");
    expect(row?.sujet).toBe("Rappel — TVA Q1 2026");
    expect(row?.corps).toContain("TVA Q1 2026");
    expect(row?.corps).toContain("Test Client"); // raison_sociale du client semé
  });

  test("idempotence : un 2e passage ne crée pas de doublon", async () => {
    const res = await genererBrouillonsRelances({ cabinetId: cabinetA.id });
    expect(res.brouillons_crees).toBe(0);
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.relance WHERE echeance_id = ${echeanceAId}
    `;
    expect(n).toBe(1);
  });

  test("client en pause : échéance ignorée", async () => {
    const clientPause = (await seedClient(sql, cabinetA.id)).id;
    const [ep] = await sql<{ id: string }[]>`
      INSERT INTO crm.echeance (cabinet_id, client_id, type, libelle, date_echeance, statut)
      VALUES (${cabinetA.id}, ${clientPause}, 'tva', 'TVA pause', CURRENT_DATE + 5, 'imminente')
      RETURNING id
    `;
    await sql`
      INSERT INTO calendar.pause_client (cabinet_id, client_id, date_debut, date_fin, actif)
      VALUES (${cabinetA.id}, ${clientPause}, CURRENT_DATE - 1, CURRENT_DATE + 30, true)
    `;
    await genererBrouillonsRelances({ cabinetId: cabinetA.id });
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.relance WHERE echeance_id = ${ep?.id}
    `;
    expect(n).toBe(0);
  });
});
