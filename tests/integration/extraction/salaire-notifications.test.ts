/**
 * G5a — envoi de notifications de cycle (intégration DB réelle, sender mocké).
 *
 * Vérifie : enregistrement salaire.notification + événement, idempotence (1/type/cycle),
 * période initiale → en_attente, destinataire résolu depuis acces_client, scope cabinet.
 * Réf : salaire.md §7.7 ; KICKOFF G5.
 */
import { envoyerNotificationCycle } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedAccesClient,
  seedClient,
  seedPeriode,
  seedTwoCabinets,
  type TestCabinet,
  type TestClient,
} from "../helpers/seed";

const sql = createServiceClient();
let cabinet: TestCabinet;
let cabinetB: TestCabinet;
let clientA: TestClient;
let periodeId: string;

// Sender mock (compatible sendCabinetEmail opts.client).
const sent: Array<{ to: string[]; subject: string }> = [];
const sender = {
  sendEmail: vi.fn(async (p: { to: string[]; subject: string; body: string }) => {
    sent.push({ to: p.to, subject: p.subject });
  }),
};

beforeAll(async () => {
  const r = await seedTwoCabinets(sql);
  cabinet = r.cabinetA;
  cabinetB = r.cabinetB;
  clientA = await seedClient(sql, cabinet.id);
  await seedAccesClient(sql, cabinet.id, clientA.id); // contact RH actif (destinataire)
  periodeId = (await seedPeriode(sql, cabinet.id, clientA.id)).id; // statut non_demandee
});

afterAll(async () => {
  await cleanupCabinets(sql, cabinet.id, cabinetB.id);
  await sql.end();
});

describe("envoyerNotificationCycle (G5a)", () => {
  test("initiale : envoie, enregistre, passe la période en_attente, destinataire = contact RH", async () => {
    const res = await envoyerNotificationCycle({
      cabinet_id: cabinet.id,
      periode_id: periodeId,
      type: "initiale",
      sender,
    });
    expect(res.status).toBe("envoyee");
    expect(sender.sendEmail).toHaveBeenCalled();
    expect(sent[0]?.to[0]).toMatch(/@test\.ch$/);

    const [n] = await sql`
      SELECT type, statut_envoi, destinataire_email FROM salaire.notification
      WHERE periode_id = ${periodeId} AND type = 'initiale'`;
    expect(n?.statut_envoi).toBe("envoyee");

    const [p] =
      await sql`SELECT statut, date_notification_envoyee FROM salaire.periode WHERE id = ${periodeId}`;
    expect(p?.statut).toBe("en_attente");
    expect(p?.date_notification_envoyee).not.toBeNull();

    const ev =
      await sql`SELECT 1 FROM salaire.evenement WHERE periode_id = ${periodeId} AND type = 'notification_envoyee'`;
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  test("idempotence : un 2e envoi du même type est ignoré", async () => {
    const before = sender.sendEmail.mock.calls.length;
    const res = await envoyerNotificationCycle({
      cabinet_id: cabinet.id,
      periode_id: periodeId,
      type: "initiale",
      sender,
    });
    expect(res.status).toBe("ignoree");
    expect(res.raison).toBe("deja_envoyee");
    expect(sender.sendEmail.mock.calls.length).toBe(before); // pas de nouvel envoi
  });

  test("destinataire explicite + type confirmation", async () => {
    const res = await envoyerNotificationCycle({
      cabinet_id: cabinet.id,
      periode_id: periodeId,
      type: "confirmation_validation",
      destinataire_email: "dirigeant@acme.ch",
      sender,
    });
    expect(res.status).toBe("envoyee");
    const [n] = await sql`
      SELECT destinataire_email FROM salaire.notification
      WHERE periode_id = ${periodeId} AND type = 'confirmation_validation'`;
    expect(n?.destinataire_email).toBe("dirigeant@acme.ch");
  });

  test("scope : période d'un autre cabinet ignorée", async () => {
    const res = await envoyerNotificationCycle({
      cabinet_id: cabinetB.id,
      periode_id: periodeId,
      type: "initiale",
      sender,
    });
    expect(res.status).toBe("ignoree");
    expect(res.raison).toBe("periode_introuvable");
  });
});
