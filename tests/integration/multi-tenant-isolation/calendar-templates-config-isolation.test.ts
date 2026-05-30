/**
 * Tests d'isolation multi-tenant — module Calendar, Run 2 (templates, config, pauses)
 *
 * Couvre le schéma calendar.* : template_echeance, modele_relance (catalogues
 * GLOBAUX cabinet_id NULL + overrides cabinet), cabinet_config, pause_client.
 *
 * Spécificité catalogue global (ADR 0011 §3, packages/db/CLAUDE.md § 1) :
 *  - un tenant LIT les lignes globales (cabinet_id NULL) + ses propres overrides ;
 *  - un tenant ne voit PAS les overrides d'un autre cabinet ;
 *  - un tenant ne peut PAS écrire de ligne globale (WITH CHECK = current_cabinet_id()).
 *
 * Plus le trigger de cohérence cabinet/client sur pause_client (multi-tenant.md § 7).
 *
 * Références :
 * - packages/db/migrations/0006_calendar_templates_config.sql
 * - docs/architecture/decisions/0011-calendar-mvp-scope.md
 * - tests/CLAUDE.md § "Multi-tenant isolation (bloquants)"
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedCalendarConfig,
  seedClient,
  seedModeleRelance,
  seedPauseClient,
  seedTemplateEcheance,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
  type TestModeleRelance,
  type TestPauseClient,
  type TestTemplateEcheance,
} from "../helpers/seed";

describe("Multi-tenant isolation — module Calendar (templates, config, pauses)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let tplA: TestTemplateEcheance;
  let tplB: TestTemplateEcheance;
  let modA: TestModeleRelance;
  let modB: TestModeleRelance;
  let _pauseA: TestPauseClient;
  let pauseB: TestPauseClient;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;

    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);

    tplA = await seedTemplateEcheance(sql, cabinetA.id);
    tplB = await seedTemplateEcheance(sql, cabinetB.id);
    modA = await seedModeleRelance(sql, cabinetA.id);
    modB = await seedModeleRelance(sql, cabinetB.id);

    await seedCalendarConfig(sql, cabinetA.id);
    await seedCalendarConfig(sql, cabinetB.id);

    _pauseA = await seedPauseClient(sql, cabinetA.id, clientA.id);
    pauseB = await seedPauseClient(sql, cabinetB.id, clientB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── Catalogue global : template_echeance ────────────────────────────────────

  test("tenant A lit les templates globaux + son override, jamais celui de B", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM calendar.template_echeance`,
    );
    const ids = rows.map((r) => r.id as string);
    // Voit son propre override
    expect(ids).toContain(tplA.id);
    // Ne voit pas l'override du cabinet B
    expect(ids).not.toContain(tplB.id);
    // Voit au moins une ligne globale du catalogue (cabinet_id NULL, seed 0006)
    expect(rows.some((r) => r.cabinet_id === null)).toBe(true);
  });

  test("tenant A ne peut pas créer un template GLOBAL (cabinet_id NULL rejeté par WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO calendar.template_echeance (cabinet_id, nom, type_echeance, frequence)
          VALUES (NULL, 'Tentative globale', 'tva', 'trimestrielle')
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas créer un template pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO calendar.template_echeance (cabinet_id, nom, type_echeance, frequence)
          VALUES (${cabinetB.id}, 'Cross-tenant', 'tva', 'trimestrielle')
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier l'override de B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE calendar.template_echeance SET nom = 'hacked' WHERE id = ${tplB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  // ─── Catalogue global : modele_relance ───────────────────────────────────────

  test("tenant A lit les modèles globaux + son override, jamais celui de B", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM calendar.modele_relance`,
    );
    const ids = rows.map((r) => r.id as string);
    expect(ids).toContain(modA.id);
    expect(ids).not.toContain(modB.id);
    expect(rows.some((r) => r.cabinet_id === null)).toBe(true);
  });

  test("tenant A ne peut pas lire l'override modèle de B par id", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM calendar.modele_relance WHERE id = ${modB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  // ─── cabinet_config ──────────────────────────────────────────────────────────

  test("tenant A ne voit que sa propre config", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT cabinet_id FROM calendar.cabinet_config`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cabinet_id).toBe(cabinetA.id);
  });

  test("tenant A ne peut pas modifier la config de B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE calendar.cabinet_config SET bulk_max_par_envoi = 9999 WHERE cabinet_id = ${cabinetB.id} RETURNING cabinet_id`,
    );
    expect(rows).toHaveLength(0);

    const [c] = await sql`
      SELECT bulk_max_par_envoi FROM calendar.cabinet_config WHERE cabinet_id = ${cabinetB.id}
    `;
    expect(c?.bulk_max_par_envoi).not.toBe(9999);
  });

  // ─── pause_client ────────────────────────────────────────────────────────────

  test("tenant A ne peut pas lire la pause du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM calendar.pause_client WHERE id = ${pauseB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas supprimer la pause du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`DELETE FROM calendar.pause_client WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);

    const [p] = await sql`SELECT id FROM calendar.pause_client WHERE id = ${pauseB.id}`;
    expect(p?.id).toBe(pauseB.id);
  });

  test("le trigger rejette une pause rattachée à un client d'un autre cabinet", async () => {
    // Service role (bypass RLS) : seul le trigger crm.fn_check_client_cabinet doit bloquer.
    await expect(
      sql`
        INSERT INTO calendar.pause_client (cabinet_id, client_id, date_debut, date_fin)
        VALUES (${cabinetA.id}, ${clientB.id}, now(), now() + interval '7 days')
      `,
    ).rejects.toThrow(/Incohérence cabinet\/client/);
  });

  // ─── Seed fédéral (Run 4) : lignes globales lisibles par tout tenant ─────────

  test("les échéances fédérales (seed Run 4) sont des lignes globales lisibles par un tenant", async () => {
    const federales = [
      "Certificat de salaire annuel",
      "Décompte annuel AVS/AC",
      "Décompte annuel LPP",
      "Décompte annuel impôt à la source (IS)",
      "Cotisations AVS trimestrielles",
    ];
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`SELECT nom, cabinet_id FROM calendar.template_echeance WHERE nom = ANY(${federales})`,
    );
    // Les 5 échéances fédérales sont visibles…
    expect(rows.map((r) => r.nom as string).sort()).toEqual([...federales].sort());
    // …et toutes globales (cabinet_id NULL), jamais rattachées à un cabinet.
    expect(rows.every((r) => r.cabinet_id === null)).toBe(true);
  });

  // ─── Vérification schéma : RLS activée ───────────────────────────────────────

  test("RLS est activée sur les 4 tables calendar.*", async () => {
    for (const t of [
      "calendar.template_echeance",
      "calendar.modele_relance",
      "calendar.cabinet_config",
      "calendar.pause_client",
    ]) {
      const [row] = await sql`
        SELECT relrowsecurity FROM pg_class WHERE oid = ${t}::regclass
      `;
      expect(row?.relrowsecurity, `RLS doit être activée sur ${t}`).toBe(true);
    }
  });
});
