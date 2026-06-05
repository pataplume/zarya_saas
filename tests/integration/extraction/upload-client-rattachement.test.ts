/**
 * Run B1 — dépôt côté client : la classification FORCE le rattachement au client connu
 * (client_id_connu, issu du JWT du contact RH), sans laisser l'IA deviner. Anti-fuite :
 * le client est imposé par le serveur, jamais déduit du contenu.
 */
import { classifyDocument, StubClassifier } from "@zarya/extraction";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

describe("Dépôt client — rattachement forcé (B1)", () => {
  let sql: postgres.Sql;
  let cab: TestCabinet;
  let cabB: TestCabinet;
  let clientCible: string;

  beforeAll(async () => {
    sql = createServiceClient();
    const r = await seedTwoCabinets(sql);
    cab = r.cabinetA;
    cabB = r.cabinetB;
    // Deux clients dans le cabinet : on dépose POUR clientCible ; un autre existe pour
    // s'assurer que le rattachement ne « bave » pas.
    clientCible = (await seedClient(sql, cab.id)).id;
    await seedClient(sql, cab.id);
  }, 60_000);

  afterAll(async () => {
    await cleanupCabinets(sql, cab.id, cabB.id);
    await sql.end();
  });

  test("client_id_connu force client_id_propose sur la proposition", async () => {
    const fp = await seedFichierPhysique(sql, cab.id);
    // Nom volontairement neutre : sans client_id_connu, l'IA ne rattacherait personne.
    const res = await classifyDocument(
      {
        cabinet_id: cab.id,
        fichier_physique_id: fp.id,
        nom_fichier: "scan-2026.pdf",
        client_id_connu: clientCible,
      },
      new StubClassifier(),
    );

    const [prop] = (await sql`
      SELECT client_id_propose FROM doc.proposition_classement WHERE id = ${res.proposition_id}
    `) as unknown as { client_id_propose: string | null }[];
    expect(prop?.client_id_propose).toBe(clientCible);
  });
});
