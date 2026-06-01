/**
 * Tests d'intégration — envoi des relances validées (Bloc C2b).
 *
 * Vérifie contre la base partagée : brouillon → envoyee, stockage des ids Microsoft,
 * événement `relance_envoyee`, et les chemins sans_destinataire / deja_envoyee.
 * L'envoi Graph (draft+send) est injecté (mock) — pas de réseau.
 *
 * Réf : packages/calendar/src/relance/envoyer.ts, migration 0028, ADR 0019.
 */

import { randomUUID } from "node:crypto";
import { envoyerRelance } from "@zarya/calendar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import { cleanupCabinets, seedClient, seedTwoCabinets, type TestCabinet } from "../helpers/seed";

const fakeSend = async () => ({
  status: "sent" as const,
  messageId: "graph-msg-1",
  internetMessageId: "<abc@zarya>",
});

describe("Envoi des relances validées — module Calendar (C2b)", () => {
  const sql = createServiceClient();
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;
  let clientId: string;
  let contactId: string;

  async function seedRelance(opts: { withEmail: boolean }): Promise<string> {
    const id = randomUUID();
    const dest = opts.withEmail ? contactId : null;
    await sql`
      INSERT INTO crm.relance (id, cabinet_id, client_id, canal, destinataire_contact_id,
                               sujet, corps, statut)
      VALUES (${id}, ${cabinetA.id}, ${clientId}, 'email', ${dest},
              'Rappel TVA', 'Bonjour, merci de transmettre.', 'brouillon')
    `;
    return id;
  }

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    clientId = (await seedClient(sql, cabinetA.id)).id;
    const [ct] = await sql<{ id: string }[]>`
      INSERT INTO crm.contact (cabinet_id, client_id, nom, est_principal, email)
      VALUES (${cabinetA.id}, ${clientId}, 'Durand', true, 'client@pme.ch')
      RETURNING id
    `;
    contactId = ct?.id ?? "";
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("brouillon → envoyee, ids stockés + événement relance_envoyee", async () => {
    const relanceId = await seedRelance({ withEmail: true });
    const res = await envoyerRelance(relanceId, { send: fakeSend, now: () => 1_700_000_000_000 });
    expect(res).toEqual({ status: "envoyee" });

    const [row] = await sql<
      { statut: string; microsoft_message_id: string; internet_message_id: string }[]
    >`
      SELECT statut, microsoft_message_id, internet_message_id
      FROM crm.relance WHERE id = ${relanceId}
    `;
    expect(row?.statut).toBe("envoyee");
    expect(row?.microsoft_message_id).toBe("graph-msg-1");
    expect(row?.internet_message_id).toBe("<abc@zarya>");

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM crm.evenement
      WHERE ressource_id = ${relanceId} AND type = 'relance_envoyee'
    `;
    expect(n).toBe(1);
  });

  test("sans destinataire → statut sans_destinataire, relance inchangée", async () => {
    const relanceId = await seedRelance({ withEmail: false });
    const res = await envoyerRelance(relanceId, { send: fakeSend });
    expect(res.status).toBe("sans_destinataire");
    const [row] = await sql<{ statut: string }[]>`
      SELECT statut FROM crm.relance WHERE id = ${relanceId}
    `;
    expect(row?.statut).toBe("brouillon");
  });

  test("relance déjà envoyée → deja_envoyee (idempotence)", async () => {
    const relanceId = await seedRelance({ withEmail: true });
    await envoyerRelance(relanceId, { send: fakeSend });
    const res = await envoyerRelance(relanceId, { send: fakeSend });
    expect(res.status).toBe("deja_envoyee");
  });

  test("token révoqué → revoked, relance reste brouillon", async () => {
    const relanceId = await seedRelance({ withEmail: true });
    const res = await envoyerRelance(relanceId, {
      send: async () => ({ status: "revoked" as const }),
    });
    expect(res.status).toBe("revoked");
    const [row] = await sql<{ statut: string }[]>`
      SELECT statut FROM crm.relance WHERE id = ${relanceId}
    `;
    expect(row?.statut).toBe("brouillon");
  });
});
