/**
 * Tests d'isolation multi-tenant — crm.invitation_membre
 *
 * Policies standard : toutes les 4 opérations filtrent sur current_cabinet_id().
 * Pas de cas particulier (pas de cabinet_id nullable).
 *
 * Références :
 * - packages/db/migrations/0002_onboarding_rls.sql — policies invitation_membre
 * - docs/architecture/multi-tenant.md § 5
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedInvitation,
  seedTwoCabinets,
  type TestCabinet,
  type TestInvitation,
} from "../helpers/seed";

describe("Multi-tenant isolation — crm.invitation_membre", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let invitationA: TestInvitation;
  let invitationB: TestInvitation;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
    invitationA = await seedInvitation(sql, cabinetA.id);
    invitationB = await seedInvitation(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  // ─── SELECT ────────────────────────────────────────────────────────────────

  test("tenant A ne voit que ses propres invitations (SELECT *)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM crm.invitation_membre`,
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.cabinet_id === cabinetB.id)).toBe(false);
  });

  test("tenant A ne voit aucun résultat en filtrant sur cabinet B (SELECT WHERE)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.invitation_membre WHERE cabinet_id = ${cabinetB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  test("tenant A ne peut pas lire l'invitation spécifique du cabinet B (SELECT par id)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id FROM crm.invitation_membre WHERE id = ${invitationB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  // ─── INSERT ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas insérer une invitation pour cabinet B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) =>
          tsql`
          INSERT INTO crm.invitation_membre (cabinet_id, email, role_propose, token_expire_at)
          VALUES (
            ${cabinetB.id},
            'attaque@cross-tenant.invalid',
            'collaborateur',
            now() + interval '7 days'
          )
        `,
      ),
    ).rejects.toThrow();
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas modifier les invitations du cabinet B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        UPDATE crm.invitation_membre
        SET statut = 'annulee'
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : statut de B inchangé
    const [inv] = await sql`
      SELECT statut FROM crm.invitation_membre WHERE id = ${invitationB.id}
    `;
    expect(inv?.statut).toBe("envoyee");
  });

  // ─── DELETE ────────────────────────────────────────────────────────────────

  test("tenant A ne peut pas supprimer les invitations du cabinet B (DELETE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) =>
        tsql`
        DELETE FROM crm.invitation_membre
        WHERE cabinet_id = ${cabinetB.id}
        RETURNING id
      `,
    );

    expect(rows).toHaveLength(0);

    // Vérification service role : invitation B existe toujours
    const [inv] = await sql`
      SELECT id FROM crm.invitation_membre WHERE id = ${invitationB.id}
    `;
    expect(inv?.id).toBe(invitationB.id);
  });

  // ─── Vérification schéma ──────────────────────────────────────────────────

  test("RLS est activée sur crm.invitation_membre (vérification schéma Postgres)", async () => {
    const [row] = await sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'crm.invitation_membre'::regclass
    `;
    expect(row?.relrowsecurity).toBe(true);
  });
});
