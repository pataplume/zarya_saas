/**
 * Vues de lecture crm.v_* + trigger derniere_activite (Bloc A10, migration 0018, §21/§23.3).
 *
 * Clôture DB de la fondation CRM (ADR 0012). On valide via le VRAI `db` applicatif :
 *   1. Contenu des trois vues (jointures + agrégats conformes à §21).
 *   2. Scoping cabinet : une requête filtrée `cabinet_id = A` ne voit jamais le
 *      cabinet B (frontière de sécurité réelle sur le chemin service-role, ADR 0005
 *      addendum — les vues exposent `cabinet_id` précisément pour ce filtre).
 *   3. Trigger §23.3 : INSERT sur crm.evenement propage `created_at` sur
 *      crm.risque.derniere_activite du client.
 *
 * Les vues ne sont PAS des tables métier (lecture seule dérivée de tables déjà
 * enregistrées dans METIER_TABLES) → hors registre anti-fuite.
 */
import { and, db, eq, vClientDashboard, vDocumentsManquants, vEcheancesAVenir } from "@zarya/db";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedDocumentAttendu,
  seedEcheance,
  seedEvenement,
  seedRisque,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Vues crm.v_* + trigger derniere_activite (A10)", () => {
  const sql: postgres.Sql = createServiceClient();

  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;

  beforeAll(async () => {
    ({ cabinetA, cabinetB } = await seedTwoCabinets(sql));
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);

    // Cabinet A : risque (niveau surveillance, score 42), 1 échéance à venir (J+14),
    // 2 documents manquants (1 'manquant', 1 'en_retard') + 1 reçu (exclu).
    await seedRisque(sql, cabinetA.id, clientA.id);
    await sql`UPDATE crm.risque SET score = 42, niveau = 'surveillance' WHERE client_id = ${clientA.id}`;
    await seedEcheance(sql, cabinetA.id, clientA.id); // J+14, statut a_venir par défaut

    const docManquant = await seedDocumentAttendu(sql, cabinetA.id, clientA.id);
    const docRetard = await seedDocumentAttendu(sql, cabinetA.id, clientA.id);
    const docRecu = await seedDocumentAttendu(sql, cabinetA.id, clientA.id);
    await sql`UPDATE crm.document_attendu SET statut_periode_courante = 'manquant' WHERE id = ${docManquant.id}`;
    await sql`UPDATE crm.document_attendu SET statut_periode_courante = 'en_retard' WHERE id = ${docRetard.id}`;
    await sql`UPDATE crm.document_attendu SET statut_periode_courante = 'recu' WHERE id = ${docRecu.id}`;

    // Cabinet B : un risque pour vérifier l'absence de fuite dans les vues.
    await seedRisque(sql, cabinetB.id, clientB.id);
    await seedEcheance(sql, cabinetB.id, clientB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── v_client_dashboard ─────────────────────────────────────────────────────

  test("v_client_dashboard : agrège risque + prochaine échéance + nb documents manquants", async () => {
    const [row] = await db
      .select()
      .from(vClientDashboard)
      .where(
        and(eq(vClientDashboard.cabinet_id, cabinetA.id), eq(vClientDashboard.id, clientA.id)),
      );

    expect(row).toBeDefined();
    expect(row?.raison_sociale).toContain("Test Client");
    expect(row?.risque_score).toBe(42);
    expect(row?.risque_niveau).toBe("surveillance");
    // 'manquant' + 'en_retard' comptés, 'recu' exclu.
    expect(row?.nb_documents_manquants).toBe(2);
    // prochaine échéance ouverte = la seule échéance J+14.
    expect(row?.prochaine_echeance).not.toBeNull();
  });

  test("v_client_dashboard : scoping cabinet — filtre A ne renvoie aucune ligne de B", async () => {
    const rows = await db
      .select({ id: vClientDashboard.id })
      .from(vClientDashboard)
      .where(eq(vClientDashboard.cabinet_id, cabinetA.id));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(clientA.id);
    expect(ids).not.toContain(clientB.id);
  });

  test("v_client_dashboard : exclut les clients archivés", async () => {
    const archived = await seedClient(sql, cabinetA.id);
    await sql`UPDATE crm.client SET archived_at = now() WHERE id = ${archived.id}`;

    const rows = await db
      .select({ id: vClientDashboard.id })
      .from(vClientDashboard)
      .where(eq(vClientDashboard.cabinet_id, cabinetA.id));
    expect(rows.map((r) => r.id)).not.toContain(archived.id);
  });

  // ─── v_echeances_a_venir ────────────────────────────────────────────────────

  test("v_echeances_a_venir : échéance J+14 présente et scopée cabinet A", async () => {
    const rows = await db
      .select({ client_id: vEcheancesAVenir.client_id, cabinet_id: vEcheancesAVenir.cabinet_id })
      .from(vEcheancesAVenir)
      .where(eq(vEcheancesAVenir.cabinet_id, cabinetA.id));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.map((r) => r.client_id)).toContain(clientA.id);
    expect(rows.map((r) => r.client_id)).not.toContain(clientB.id);
  });

  // ─── v_documents_manquants ──────────────────────────────────────────────────

  test("v_documents_manquants : ne renvoie que 'manquant' + 'en_retard', scopé cabinet A", async () => {
    const rows = await db
      .select({
        client_id: vDocumentsManquants.client_id,
        statut: vDocumentsManquants.statut_periode_courante,
      })
      .from(vDocumentsManquants)
      .where(eq(vDocumentsManquants.cabinet_id, cabinetA.id));

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.client_id === clientA.id)).toBe(true);
    const statuts = rows.map((r) => r.statut).sort();
    expect(statuts).toEqual(["en_retard", "manquant"]);
  });

  // ─── Trigger derniere_activite (§23.3) ──────────────────────────────────────

  test("trigger derniere_activite : INSERT evenement met à jour crm.risque.derniere_activite", async () => {
    const before = await sql`
      SELECT derniere_activite FROM crm.risque WHERE client_id = ${clientA.id}
    `;
    expect(before[0]?.derniere_activite).toBeNull();

    await seedEvenement(sql, cabinetA.id, clientA.id);

    const after = await sql`
      SELECT derniere_activite FROM crm.risque WHERE client_id = ${clientA.id}
    `;
    expect(after[0]?.derniere_activite).not.toBeNull();
  });

  test("trigger derniere_activite : evenement cabinet-level (client_id NULL) ne casse rien", async () => {
    // Aucune ligne risque visée → UPDATE sur 0 ligne, pas d'erreur.
    await expect(seedEvenement(sql, cabinetA.id, null)).resolves.toBeDefined();
  });
});
