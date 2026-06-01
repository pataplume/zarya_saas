/**
 * Tests d'intégration — ingestion email (D4b) contre la base partagée.
 *
 * Vérifie que ingestEmailNotification écrit dans doc.email_brut via la VRAIE persistance
 * (upsertEmailBrut + findSubscriptionByGraphId), avec une subscription seedée et un
 * message Graph mocké (makeClient injecté). Couvre l'idempotence (UNIQUE cabinet+message).
 *
 * Réf : packages/integrations/src/microsoft/email-ingestion.ts, migration 0026.
 */
import { ingestEmailNotification } from "@zarya/integrations";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

describe("Ingestion email — idempotence + persistance réelle (D4b)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  const subscriptionId = "graph-sub-ci-d4b";
  const secret = "secret-ci-d4b";

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    await sql`
      INSERT INTO doc.email_subscription
        (cabinet_id, subscription_id, resource, client_state_secret, expiration_at)
      VALUES (${cabinetA.id}, ${subscriptionId}, ${"/me/mailFolders('Inbox')/messages"},
              ${secret}, now() + interval '72 hours')
    `;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  const fakeClient = () => ({
    getEmail: async () => ({
      id: "msg-ci-1",
      subject: "Facture CI",
      from: "client@pme.ch",
      receivedDateTime: "2026-03-01T10:00:00Z",
      hasAttachments: false,
      bodyPreview: "aperçu",
      bodyContentType: "text",
      body: "corps",
      toRecipients: [],
    }),
  });

  const notif = {
    subscriptionId,
    clientState: secret,
    resourceData: { id: "msg-ci-1" },
  };

  test("1re notification → ingested, ligne email_brut créée et scopée au bon cabinet", async () => {
    const status = await ingestEmailNotification(notif, { makeClient: fakeClient });
    expect(status).toBe("ingested");
    const rows = await sql<{ cabinet_id: string; subject: string; statut: string }[]>`
      SELECT cabinet_id, subject, statut FROM doc.email_brut
      WHERE cabinet_id = ${cabinetA.id} AND message_id = 'msg-ci-1'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cabinet_id: cabinetA.id,
      subject: "Facture CI",
      statut: "recu",
    });
  });

  test("2e notification identique → duplicate (idempotence), pas de doublon", async () => {
    const status = await ingestEmailNotification(notif, { makeClient: fakeClient });
    expect(status).toBe("duplicate");
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM doc.email_brut
      WHERE cabinet_id = ${cabinetA.id} AND message_id = 'msg-ci-1'
    `;
    expect(n).toBe(1);
  });

  test("clientState invalide → unauthorized, rien n'est écrit", async () => {
    const status = await ingestEmailNotification(
      { ...notif, clientState: "mauvais", resourceData: { id: "msg-ci-2" } },
      { makeClient: fakeClient },
    );
    expect(status).toBe("unauthorized");
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM doc.email_brut
      WHERE cabinet_id = ${cabinetA.id} AND message_id = 'msg-ci-2'
    `;
    expect(n).toBe(0);
  });
});
