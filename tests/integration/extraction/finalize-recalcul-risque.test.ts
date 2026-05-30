/**
 * B5 — Recalcul du risque client à la finalisation (effet de bord en chaîne).
 *
 * Couvre le chemin RÉEL `finaliserDocument()` (partagé validation humaine + auto-classement)
 * contre la base de test : à la finalisation d'un document, `crm.risque` est upserté selon le
 * barème ADR 0015 (provisoire v1), un événement `document_recu` est tracé, et un événement
 * `score_recalcule` est émis UNIQUEMENT quand le niveau change (anti-bruit).
 *
 * Tout est réel (db service-role, triggers, FK) ; aucune I/O réseau.
 *
 * Références : KICKOFF § BLOC B / B5 · flow-a §7 · ADR 0015 · crm-schema.md §17/§23.2.
 */
import { randomUUID } from "node:crypto";
import { finaliserDocument } from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedClient,
  seedFichierPhysique,
  seedProposition,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const sql = createServiceClient();

async function seedAttendu(
  cabinet_id: string,
  client_id: string,
  statut: "en_retard" | "manquant" | "recu",
): Promise<void> {
  await sql`
    INSERT INTO crm.document_attendu
      (id, cabinet_id, client_id, type_document, frequence, actif, statut_periode_courante)
    VALUES (${randomUUID()}, ${cabinet_id}, ${client_id}, ${`Attendu ${randomUUID().slice(0, 8)}`},
            'mensuelle', true, ${statut}::crm.statut_periode_doc)
  `;
}

async function seedEcheanceEnRetard(cabinet_id: string, client_id: string): Promise<void> {
  await sql`
    INSERT INTO crm.echeance (id, cabinet_id, client_id, type, libelle, date_echeance, statut)
    VALUES (${randomUUID()}, ${cabinet_id}, ${client_id}, 'tva', 'Échéance retard',
            current_date - interval '5 days', 'en_retard'::crm.statut_echeance)
  `;
}

// Finalise un document neuf (periode null ⇒ aucun appariement d'attente, compteurs
// inchangés ⇒ score déterministe). Retourne l'id du document créé.
async function finalise(cabinet_id: string, client_id: string): Promise<string> {
  const fichier = await seedFichierPhysique(sql, cabinet_id);
  const prop = await seedProposition(sql, cabinet_id, fichier.id);
  const fin = await finaliserDocument({
    cabinet_id,
    client_id,
    fichier_physique_id: fichier.id,
    proposition_classement_id: prop.id,
    type: "releve_bancaire",
    categorie: "bancaire",
    periode: null,
    libelle: "Relevé sans période",
    statut_classement: "valide_humain",
    confiance_classement: null,
    acteur_type: "cabinet_membre",
    acteur_id: null,
    cree_par: null,
  });
  return fin.document_id;
}

describe("finaliserDocument — B5 recalcul risque", () => {
  let cabinetA: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("upsert crm.risque selon le barème + événement score_recalcule au 1er calcul", async () => {
    const client = await seedClient(sql, cabinetA.id);
    // 1 doc en retard (20) + 1 doc manquant (10) + 1 échéance en retard (25) = 55 → critique.
    await seedAttendu(cabinetA.id, client.id, "en_retard");
    await seedAttendu(cabinetA.id, client.id, "manquant");
    await seedEcheanceEnRetard(cabinetA.id, client.id);

    const docId = await finalise(cabinetA.id, client.id);

    const [risque] = await sql`
      SELECT score, niveau, drapeau_critique, drapeau_motif, facteurs, dernier_calcul
      FROM crm.risque WHERE client_id = ${client.id}
    `;
    expect(risque?.score).toBe(55);
    expect(risque?.niveau).toBe("critique");
    expect(risque?.drapeau_critique).toBe(true);
    expect(risque?.drapeau_motif).toContain("1 échéance(s) en retard");
    expect(risque?.facteurs?.version).toBe("v1");
    expect(risque?.facteurs?.nb_documents_en_retard).toBe(1);
    expect(risque?.dernier_calcul).not.toBeNull();

    // document_recu (toujours) + score_recalcule (niveau null→critique).
    const [recu] = await sql`
      SELECT id FROM crm.evenement
      WHERE ressource_id = ${docId} AND type = 'document_recu'
    `;
    expect(recu).toBeDefined();

    const recalculs = await sql`
      SELECT acteur_type, ressource_type, metadata FROM crm.evenement
      WHERE client_id = ${client.id} AND type = 'score_recalcule'
    `;
    expect(recalculs.length).toBe(1);
    expect(recalculs[0]?.ressource_type).toBe("crm.risque");
    expect(recalculs[0]?.metadata?.niveau_avant).toBeNull();
  });

  test("anti-bruit : 2ᵉ finalisation sans changement de niveau → pas de nouvel événement score_recalcule", async () => {
    const client = await seedClient(sql, cabinetA.id);
    await seedAttendu(cabinetA.id, client.id, "en_retard"); // 20 → surveillance

    await finalise(cabinetA.id, client.id);
    await finalise(cabinetA.id, client.id); // mêmes signaux ⇒ niveau inchangé

    const [risque] = await sql`SELECT niveau FROM crm.risque WHERE client_id = ${client.id}`;
    expect(risque?.niveau).toBe("surveillance");

    const recalculs = await sql`
      SELECT id FROM crm.evenement WHERE client_id = ${client.id} AND type = 'score_recalcule'
    `;
    expect(recalculs.length).toBe(1); // une seule trace (null→surveillance), pas la 2ᵉ fois
  });

  test("anti-fuite : le score ne compte QUE les signaux du client finalisé", async () => {
    const clientA = await seedClient(sql, cabinetA.id);
    const clientAutre = await seedClient(sql, cabinetA.id);
    // clientAutre accumule des signaux qui ne doivent PAS gonfler le score de clientA.
    await seedAttendu(cabinetA.id, clientAutre.id, "en_retard");
    await seedAttendu(cabinetA.id, clientAutre.id, "en_retard");
    await seedEcheanceEnRetard(cabinetA.id, clientAutre.id);
    // clientA n'a qu'un seul doc manquant (10 → surveillance).
    await seedAttendu(cabinetA.id, clientA.id, "manquant");

    await finalise(cabinetA.id, clientA.id);

    const [risque] =
      await sql`SELECT score, niveau FROM crm.risque WHERE client_id = ${clientA.id}`;
    expect(risque?.score).toBe(10);
    expect(risque?.niveau).toBe("surveillance");
  });

  test("aucun signal → score 0, niveau ok", async () => {
    const client = await seedClient(sql, cabinetA.id);
    await finalise(cabinetA.id, client.id);

    const [risque] =
      await sql`SELECT score, niveau, drapeau_critique FROM crm.risque WHERE client_id = ${client.id}`;
    expect(risque?.score).toBe(0);
    expect(risque?.niveau).toBe("ok");
    expect(risque?.drapeau_critique).toBe(false);
  });
});
