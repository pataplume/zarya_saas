/**
 * Tests d'isolation multi-tenant — doc.email_subscription + doc.email_brut (Bloc D4a).
 *
 * BLOQUANTS en CI. Vérifient les RLS policies (chemin DB). Le chemin applicatif
 * (db service role) est couvert par cross-tenant-leak/generic-leak.test.ts.
 *
 * Particularité : pas de client_id (l'email brut n'est pas encore rattaché à un client),
 * donc pas de trigger fn_check_client_cabinet — isolation portée par les 4 policies RLS.
 *
 * Réf : packages/db/migrations/0026_doc_email_ingestion.sql.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient, queryAsTenant } from "../helpers/rls";
import {
  cleanupCabinets,
  seedEmailBrut,
  seedEmailSubscription,
  seedTwoCabinets,
  type TestCabinet,
  type TestEmailBrut,
  type TestEmailSubscription,
} from "../helpers/seed";

describe("Multi-tenant isolation — doc.email_brut / email_subscription (D4a)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let subA: TestEmailSubscription;
  let subB: TestEmailSubscription;
  let brutA: TestEmailBrut;
  let brutB: TestEmailBrut;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    subA = await seedEmailSubscription(sql, cabinetA.id);
    subB = await seedEmailSubscription(sql, cabinetB.id);
    brutA = await seedEmailBrut(sql, cabinetA.id);
    brutB = await seedEmailBrut(sql, cabinetB.id);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("subscription : tenant A ne voit que les siennes", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM doc.email_subscription`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
    expect(rows.some((r) => r.id === subB.id)).toBe(false);
    expect(rows.some((r) => r.id === subA.id)).toBe(true);
  });

  test("email_brut : tenant A voit le sien mais pas celui de B", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`SELECT id, cabinet_id FROM doc.email_brut`,
    );
    expect(rows.some((r) => r.id === brutA.id)).toBe(true);
    expect(rows.some((r) => r.id === brutB.id)).toBe(false);
    expect(rows.every((r) => r.cabinet_id === cabinetA.id)).toBe(true);
  });

  test("email_brut : tenant A ne peut pas insérer pour B (WITH CHECK)", async () => {
    await expect(
      queryAsTenant(
        sql,
        cabinetA.id,
        (tsql) => tsql`
          INSERT INTO doc.email_brut (cabinet_id, message_id)
          VALUES (${cabinetB.id}, 'msg-intrus')
        `,
      ),
    ).rejects.toThrow();
  });

  test("subscription : tenant A ne peut pas modifier celle de B (UPDATE silencieux)", async () => {
    const rows = await queryAsTenant(
      sql,
      cabinetA.id,
      (tsql) => tsql`
        UPDATE doc.email_subscription SET statut = 'revoquee'
        WHERE cabinet_id = ${cabinetB.id} RETURNING id
      `,
    );
    expect(rows).toHaveLength(0);
    const [row] = await sql`SELECT statut FROM doc.email_subscription WHERE id = ${subB.id}`;
    expect(row?.statut).toBe("active");
  });

  test("RLS activée sur les deux tables", async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE oid IN ('doc.email_brut'::regclass, 'doc.email_subscription'::regclass)
    `;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
