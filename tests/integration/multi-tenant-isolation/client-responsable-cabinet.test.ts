/**
 * Tests de cohérence cabinet/responsable — crm.client (Bloc A1, ADR 0012).
 *
 * BLOQUANT en CI. La colonne crm.client.responsable_id (FK → crm.cabinet_membre)
 * doit TOUJOURS pointer vers un membre du MÊME cabinet que le client. Le trigger
 * trg_check_responsable_cabinet_client (migration 0009) le garantit — sans lui, on
 * pourrait affecter à un client le collaborateur d'un autre cabinet (fuite tenant).
 *
 * On teste le trigger via le service role (qui bypasse la RLS) : le service role
 * est précisément le chemin où une erreur applicative pourrait écrire une valeur
 * incohérente — le trigger est le dernier rempart.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Cohérence cabinet/responsable — crm.client", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    cabinetB = result.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("INSERT avec responsable du MÊME cabinet est accepté", async () => {
    const rows = await sql`
      INSERT INTO crm.client (cabinet_id, raison_sociale, responsable_id)
      VALUES (${cabinetA.id}, 'Client avec responsable OK SA', ${cabinetA.membre_id})
      RETURNING id, responsable_id
    `;
    expect(rows[0]?.responsable_id).toBe(cabinetA.membre_id);
  });

  test("INSERT avec responsable d'un AUTRE cabinet est rejeté par le trigger", async () => {
    await expect(
      sql`
        INSERT INTO crm.client (cabinet_id, raison_sociale, responsable_id)
        VALUES (${cabinetA.id}, 'Client responsable cross-tenant SA', ${cabinetB.membre_id})
      `,
    ).rejects.toThrow(/Incohérence cabinet\/responsable/);
  });

  test("UPDATE affectant un responsable d'un AUTRE cabinet est rejeté par le trigger", async () => {
    const [c] = await sql`
      INSERT INTO crm.client (cabinet_id, raison_sociale)
      VALUES (${cabinetA.id}, 'Client à réassigner SA')
      RETURNING id
    `;
    await expect(
      sql`UPDATE crm.client SET responsable_id = ${cabinetB.membre_id} WHERE id = ${c?.id}`,
    ).rejects.toThrow(/Incohérence cabinet\/responsable/);
  });

  test("responsable_id NULL reste autorisé (client sans référent)", async () => {
    const rows = await sql`
      INSERT INTO crm.client (cabinet_id, raison_sociale, responsable_id)
      VALUES (${cabinetB.id}, 'Client sans responsable SA', NULL)
      RETURNING id, responsable_id
    `;
    expect(rows[0]?.responsable_id).toBeNull();
  });
});
