/**
 * Vérifie le helper createTestUser() — Phase 3.6.
 *
 * Confirme que l'API admin Supabase est joignable depuis l'environnement de test
 * et que l'utilisateur créé est cohérent (auth.users + crm.cabinet_membre +
 * app_metadata), puis que le cleanup le supprime bien.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { cleanupTestUsers, createTestUser, type TestUser } from "../helpers/auth";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Helper createTestUser", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let user: TestUser;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinetA = result.cabinetA;
    user = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "collaborateur" });
  });

  afterAll(async () => {
    await cleanupTestUsers(sql, user);
    await cleanupCabinets(sql, cabinetA.id);
    await sql.end();
  });

  test("crée un crm.cabinet_membre rattaché au cabinet avec le bon rôle", async () => {
    const [membre] = await sql`
      SELECT cabinet_id, role FROM crm.cabinet_membre WHERE user_id = ${user.id}
    `;
    expect(membre?.cabinet_id).toBe(cabinetA.id);
    expect(membre?.role).toBe("collaborateur");
  });

  test("renseigne app_metadata {cabinet_id, role} sur l'objet authUser", () => {
    expect(user.authUser.id).toBe(user.id);
    expect(user.authUser.app_metadata.cabinet_id).toBe(cabinetA.id);
    expect(user.authUser.app_metadata.role).toBe("collaborateur");
  });

  test("cleanup supprime le membre", async () => {
    const tmp = await createTestUser(sql, { cabinet_id: cabinetA.id, role: "lecteur" });
    await cleanupTestUsers(sql, tmp);
    const rows = await sql`SELECT 1 FROM crm.cabinet_membre WHERE user_id = ${tmp.id}`;
    expect(rows).toHaveLength(0);
  });
});
