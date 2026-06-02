/**
 * Tests d'isolation multi-tenant — cluster propositions onboarding (Bloc F6a, migration 0033).
 *
 * BLOQUANTS en CI. Vérifient les RLS policies (chemin DB) + le trigger de cohérence
 * fn_check_client_cabinet (couple cabinet_id/client_id) sur les 5 nouvelles tables. Le chemin
 * applicatif (db service role, RLS contournée) est couvert par cross-tenant-leak/generic-leak.
 *
 * Références : /docs/architecture/multi-tenant.md § 5 ; packages/db/migrations/0033… ; ADR 0007.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedExtractionIa,
  seedPropositionChamp,
  seedPropositionEmploye,
  seedSessionOnboarding,
  seedTwoCabinets,
  seedUploadFichier,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

describe("Multi-tenant isolation — cluster propositions onboarding (F6a)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientA: TestClient;
  let clientB: TestClient;
  let sessionA: { id: string };
  let sessionB: { id: string };
  let propEmpA: { id: string };

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientA = await seedClient(sql, cabinetA.id);
    clientB = await seedClient(sql, cabinetB.id);
    sessionA = await seedSessionOnboarding(sql, cabinetA.id, clientA.id);
    sessionB = await seedSessionOnboarding(sql, cabinetB.id, clientB.id);
    const uplA = await seedUploadFichier(sql, cabinetA.id, clientA.id, sessionA.id);
    const extrA = await seedExtractionIa(sql, cabinetA.id, clientA.id, uplA.id);
    propEmpA = await seedPropositionEmploye(sql, cabinetA.id, clientA.id, sessionA.id, extrA.id);
    await seedPropositionChamp(sql, cabinetA.id, clientA.id, propEmpA.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("tenant A ne voit que ses propres sessions (RLS SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM salaire.session_onboarding`,
    );
    expect(rows.some((r) => r.id === sessionA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === sessionB.id)).toBe(false);
  });

  test("tenant A ne voit que ses propres propositions d'employé (RLS SELECT)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM salaire.proposition_employe`,
    );
    expect(rows.some((r) => r.id === propEmpA.id)).toBe(true);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  test("tenant A ne peut pas insérer une session dans le cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO salaire.session_onboarding (id, cabinet_id, client_id)
          VALUES (gen_random_uuid(), ${cabinetB.id}, ${clientB.id})
        `,
      ),
    ).rejects.toThrow();
  });

  test("tenant A ne peut pas modifier la proposition du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`UPDATE salaire.proposition_employe SET rejetee_motif = 'hack'
             WHERE cabinet_id = ${cabinetB.id} RETURNING id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("le trigger refuse une session dont le client appartient à un autre cabinet", async () => {
    // Client frais dans B (sans session) → l'échec vient du trigger de cohérence, pas de
    // la contrainte UNIQUE(client_id) qui s'appliquerait à clientB (déjà titulaire de sessionB).
    const clientBFrais = await seedClient(sql, cabinetB.id);
    await expect(
      sql`
        INSERT INTO salaire.session_onboarding (id, cabinet_id, client_id)
        VALUES (gen_random_uuid(), ${cabinetA.id}, ${clientBFrais.id})
      `,
    ).rejects.toThrow();
  });

  test.each([
    ["salaire", "session_onboarding"],
    ["salaire", "upload_fichier"],
    ["salaire", "extraction_ia"],
    ["salaire", "proposition_employe"],
    ["salaire", "proposition_champ"],
  ])("RLS est activée sur %s.%s", async (schema, table) => {
    const [row] = await sql`
      SELECT relrowsecurity FROM pg_class WHERE oid = ${`${schema}.${table}`}::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
