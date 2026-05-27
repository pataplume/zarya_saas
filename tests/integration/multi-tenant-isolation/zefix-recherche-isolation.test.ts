/**
 * Tests d'isolation multi-tenant — crm.zefix_recherche_cabinet
 *
 * Cas particulier (ADR 0009) : cabinet_id est NULLABLE.
 * Pendant l'étape A de l'onboarding, le cabinet n'existe pas encore →
 * les recherches Zefix ont cabinet_id = NULL.
 *
 * Policies notables :
 * - INSERT WITH CHECK : cabinet_id = current_cabinet_id() OR cabinet_id IS NULL
 *   → Un tenant authentifié PEUT insérer avec cabinet_id = NULL (étape A)
 * - SELECT USING : cabinet_id = current_cabinet_id() seulement
 *   → Les records NULL ne sont visibles par personne via RLS
 *
 * Références :
 * - packages/db/migrations/0002_onboarding_rls.sql — policies zefix_recherche_cabinet
 * - docs/architecture/multi-tenant.md § 5
 * - ADR 0009 — intégration Zefix
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedTwoCabinets,
  seedZefixRecherche,
  type TestCabinet,
  type TestZefixRecherche,
} from "../helpers/seed";

describe("Multi-tenant isolation — crm.zefix_recherche_cabinet", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let rechercheA: TestZefixRecherche;
  let rechercheB: TestZefixRecherche;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    rechercheA = await seedZefixRecherche(sql, cabinetA.id);
    rechercheB = await seedZefixRecherche(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres recherches Zefix (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.zefix_recherche_cabinet`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne voit aucun résultat en filtrant sur cabinet B (SELECT WHERE)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.zefix_recherche_cabinet WHERE cabinet_id = ${cabinetB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas lire la recherche spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.zefix_recherche_cabinet WHERE id = ${rechercheB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  // ─── INSERT — cas nominaux ─────────────────────────────────────────────────

  test("tenant A peut insérer avec cabinet_id = NULL (étape A onboarding autorisée)", async () => {
    // ADR 0009 : pendant l'onboarding step A, le cabinet n'existe pas encore
    // La policy INSERT WITH CHECK autorise cabinet_id IS NULL.
    //
    // Note technique : INSERT ... RETURNING échoue ici car la policy SELECT exclut les records NULL
    // (cabinet_id = current_cabinet_id() → FALSE pour NULL). On vérifie donc l'INSERT sans RETURNING
    // puis on confirme via le service role que la ligne existe bien en base.
    const testRequete = "Recherche onboarding step A CI";

    // L'INSERT sans RETURNING doit réussir (WITH CHECK passe pour cabinet_id IS NULL)
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.zefix_recherche_cabinet (cabinet_id, requete, consentement_donne)
          VALUES (NULL, ${testRequete}, true)
        `,
      ),
    ).resolves.toBeDefined();

    // Vérification service role : la ligne existe
    const [inserted] = await sql`
      SELECT id FROM crm.zefix_recherche_cabinet
      WHERE requete = ${testRequete} AND cabinet_id IS NULL
    `;
    expect(inserted?.id).toBeTruthy();

    // Cleanup du record NULL (pas rattaché à un cabinet, cleanupCabinets ne le supprime pas)
    await sql`DELETE FROM crm.zefix_recherche_cabinet WHERE requete = ${testRequete} AND cabinet_id IS NULL`;
  });

  test("les records cabinet_id = NULL ne sont visibles par aucun tenant (SELECT isolation)", async () => {
    // Insérer un record NULL via service role
    const [{ id: nullId }] = await sql`
      INSERT INTO crm.zefix_recherche_cabinet (cabinet_id, requete, consentement_donne)
      VALUES (NULL, 'Record NULL orphelin CI', true)
      RETURNING id
    `;

    // Ni tenant A ni tenant B ne doit le voir
    const rowsA = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.zefix_recherche_cabinet WHERE id = ${nullId}`,
    );
    const rowsB = await queryAsTenant(
      sql,
      cabinetB.id,
      (tsql) => tsql`SELECT id FROM crm.zefix_recherche_cabinet WHERE id = ${nullId}`,
    );

    expect(rowsA).toHaveLength(0);
    expect(rowsB).toHaveLength(0);

    // Cleanup
    await sql`DELETE FROM crm.zefix_recherche_cabinet WHERE id = ${nullId}`;
  });

  // ─── INSERT — cross-tenant bloqué ─────────────────────────────────────────

  test("tenant A ne peut pas insérer une recherche avec cabinet_id = B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.zefix_recherche_cabinet (cabinet_id, requete, consentement_donne)
          VALUES (${cabinetB.id}, 'Attaque cross-tenant', true)
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les recherches du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.zefix_recherche_cabinet
        SET requete = 'Tentative modification cross-tenant'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : requête de B inchangée
    const [rec] = await sql`
      SELECT requete FROM crm.zefix_recherche_cabinet WHERE id = ${rechercheB.id}
    `;
    expect(rec?.requete).toMatch(/^Test CI/);
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les recherches du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.zefix_recherche_cabinet
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : recherche B existe toujours
    const [rec] = await sql`
      SELECT id FROM crm.zefix_recherche_cabinet WHERE id = ${rechercheB.id}
    `;
    expect(rec?.id).toBe(rechercheB.id);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.zefix_recherche_cabinet (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.zefix_recherche_cabinet'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
