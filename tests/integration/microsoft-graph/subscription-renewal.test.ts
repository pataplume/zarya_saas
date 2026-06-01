/**
 * Tests d'intégration — renouvellement subscriptions (D4c) contre la base partagée.
 *
 * Couvre le scan réel (listExpiringSubscriptions) + la persistance réelle du
 * renouvellement (updateSubscriptionExpiration) et de l'échec (markSubscriptionError),
 * avec le client Graph mocké (makeClient injecté).
 *
 * Réf : packages/integrations/src/microsoft/subscription-renewal.ts, migration 0026.
 */
import { listExpiringSubscriptions, renewExpiringSubscriptions } from "@zarya/integrations";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

async function seedSub(
  sql: ReturnType<typeof createServiceClient>,
  cabinet_id: string,
  graphId: string,
  expiresInHours: number,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO doc.email_subscription
      (cabinet_id, subscription_id, resource, client_state_secret, expiration_at)
    VALUES (${cabinet_id}, ${graphId}, ${"/me/mailFolders('Inbox')/messages"},
            ${"secret"}, now() + (${expiresInHours} || ' hours')::interval)
    RETURNING id
  `;
  return row?.id ?? "";
}

describe("Renouvellement subscriptions — scan + persistance réelle (D4c)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let nearId: string; // expire bientôt (dans la fenêtre)
  let errId: string; // pour le chemin d'échec

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    nearId = await seedSub(sql, cabinetA.id, "graph-near", 1);
    await seedSub(sql, cabinetA.id, "graph-far", 100); // hors fenêtre (exclusion)
    errId = await seedSub(sql, cabinetB.id, "graph-err", 1);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("listExpiringSubscriptions inclut les expirantes, exclut les lointaines", async () => {
    const before = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const rows = await listExpiringSubscriptions(before);
    expect(rows.some((r) => r.subscription_id === "graph-near")).toBe(true);
    expect(rows.some((r) => r.subscription_id === "graph-err")).toBe(true);
    expect(rows.some((r) => r.subscription_id === "graph-far")).toBe(false);
  });

  test("renouvellement réussi → expiration mise à jour, statut active", async () => {
    const res = await renewExpiringSubscriptions({
      list: async () => [{ id: nearId, cabinet_id: cabinetA.id, subscription_id: "graph-near" }],
      makeClient: () => ({
        renewSubscription: async (_id: string, exp: string) => ({
          id: _id,
          expirationDateTime: exp,
        }),
      }),
      now: () => 1_700_000_000_000,
    });
    expect(res).toEqual({ total: 1, renewed: 1, failed: 0 });
    const [row] = await sql<{ statut: string; expiration_at: Date }[]>`
      SELECT statut, expiration_at FROM doc.email_subscription WHERE id = ${nearId}
    `;
    expect(row?.statut).toBe("active");
    expect(new Date(row?.expiration_at as Date).toISOString()).toBe(
      new Date(1_700_000_000_000 + 70 * 60 * 60 * 1000).toISOString(),
    );
  });

  test("échec de renouvellement → statut 'erreur' + derniere_erreur persistés", async () => {
    const res = await renewExpiringSubscriptions({
      list: async () => [{ id: errId, cabinet_id: cabinetB.id, subscription_id: "graph-err" }],
      makeClient: () => ({
        renewSubscription: async () => {
          throw new Error("graph down");
        },
      }),
    });
    expect(res).toEqual({ total: 1, renewed: 0, failed: 1 });
    const [row] = await sql<{ statut: string; derniere_erreur: string }[]>`
      SELECT statut, derniere_erreur FROM doc.email_subscription WHERE id = ${errId}
    `;
    expect(row?.statut).toBe("erreur");
    expect(row?.derniere_erreur).toBe("graph down");
  });
});
