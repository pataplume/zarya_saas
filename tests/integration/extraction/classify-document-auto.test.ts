/**
 * B4 — Décision auto-classement vs file de validation (politique cabinet).
 *
 * Couvre le chemin RÉEL `classifyDocument()` contre la base de test : la politique
 * `crm.cabinet.politique_classement` route la proposition soit vers la file (statut
 * `a_valider`, comportement MVP `strict`), soit vers l'auto-classement (création
 * `doc.document` `statut_classement='auto'`, événement `crm.evenement` `acteur_type='ia'`,
 * proposition terminale `valide`).
 *
 * Le Classifier live est injecté (aucune I/O réseau) ; tout le reste est réel (db
 * service-role, resolver client B2, appariement attente B3, triggers, FK).
 *
 * Références : KICKOFF § BLOC B / B4 · flow-a §4 · ADR 0014 · ADR 0007.
 */
import { randomUUID } from "node:crypto";
import {
  type ClassificationProposal,
  type ClassificationResult,
  type Classifier,
  classifyDocument,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const sql = createServiceClient();

function fakeClassifier(proposal: ClassificationProposal): Classifier {
  const result: ClassificationResult = {
    proposal,
    model_used: "stub",
    prompt_version: "stub-v1",
    duration_ms: 1,
    raw_output: {},
  };
  return { mode: "live", classify: async () => result };
}

function proposal(over: Partial<ClassificationProposal>): ClassificationProposal {
  return {
    type: "releve_bancaire",
    categorie: "bancaire",
    libelle: "Relevé UBS avril 2026",
    periode: "2026-04",
    confiance_globale: 0.97,
    confiance_par_champ: {},
    anomalies: [],
    ...over,
  };
}

// Client au nom maîtrisé pour que le resolver B2 le rattache (substring → palier proposer).
async function seedNamedClient(cabinet_id: string, raison_sociale: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.client (id, cabinet_id, raison_sociale, statut)
    VALUES (${id}, ${cabinet_id}, ${raison_sociale}, 'actif')
  `;
  return id;
}

async function setPolitique(cabinet_id: string, p: "strict" | "hybride" | "aggressive") {
  await sql`UPDATE crm.cabinet SET politique_classement = ${p}::crm.politique_classement WHERE id = ${cabinet_id}`;
}

describe("classifyDocument — B4 décision auto-classement", () => {
  let cabinetA: TestCabinet; // a un client nommé (rattachable)
  let cabinetB: TestCabinet; // aucun client (rattachement impossible)
  const RAISON = "Boulangerie Helvetia Lausanne SA";

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinetA = r.cabinetA;
    cabinetB = r.cabinetB;
    await seedNamedClient(cabinetA.id, RAISON);
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinetA.id, cabinetB.id);
    await sql.end();
  });

  test("strict (défaut MVP) : haute confiance → file, aucun doc.document créé", async () => {
    await setPolitique(cabinetA.id, "strict");
    const fichier = await seedFichierPhysique(sql, cabinetA.id);

    const res = await classifyDocument(
      {
        cabinet_id: cabinetA.id,
        fichier_physique_id: fichier.id,
        nom_fichier: `${RAISON} relevé.pdf`,
      },
      fakeClassifier(proposal({ confiance_globale: 0.99 })),
    );

    expect(res.auto_classe).toBe(false);
    expect(res.document_id).toBeNull();
    const [doc] =
      await sql`SELECT id FROM doc.document WHERE proposition_classement_id = ${res.proposition_id}`;
    expect(doc).toBeUndefined();
    const [prop] =
      await sql`SELECT statut FROM doc.proposition_classement WHERE id = ${res.proposition_id}`;
    expect(prop?.statut).toBe("a_valider");
  });

  test("hybride : > 0.95 sans anomalie + client rattaché → auto (doc 'auto' + événement 'ia')", async () => {
    await setPolitique(cabinetA.id, "hybride");
    const fichier = await seedFichierPhysique(sql, cabinetA.id);

    const res = await classifyDocument(
      {
        cabinet_id: cabinetA.id,
        fichier_physique_id: fichier.id,
        nom_fichier: `${RAISON} relevé avril.pdf`,
      },
      fakeClassifier(proposal({ confiance_globale: 0.97 })),
    );

    expect(res.auto_classe).toBe(true);
    expect(res.document_id).not.toBeNull();

    const [doc] = await sql`
      SELECT id, statut_classement, cree_par, client_id, type, periode
      FROM doc.document WHERE id = ${res.document_id}
    `;
    expect(doc?.statut_classement).toBe("auto");
    expect(doc?.cree_par).toBeNull();
    expect(doc?.periode).toBe("2026-04");

    const [prop] = await sql`
      SELECT statut, valide_par, document_id FROM doc.proposition_classement WHERE id = ${res.proposition_id}
    `;
    expect(prop?.statut).toBe("valide");
    expect(prop?.valide_par).toBeNull();
    expect(prop?.document_id).toBe(res.document_id);

    const [evt] = await sql`
      SELECT acteur_type, acteur_id, ressource_type, type
      FROM crm.evenement WHERE ressource_id = ${res.document_id} AND type = 'document_recu'
    `;
    expect(evt?.acteur_type).toBe("ia");
    expect(evt?.acteur_id).toBeNull();
    expect(evt?.ressource_type).toBe("doc.document");
  });

  test("hybride : haute confiance MAIS anomalie → file (pas d'auto)", async () => {
    await setPolitique(cabinetA.id, "hybride");
    const fichier = await seedFichierPhysique(sql, cabinetA.id);

    const res = await classifyDocument(
      {
        cabinet_id: cabinetA.id,
        fichier_physique_id: fichier.id,
        nom_fichier: `${RAISON} relevé.pdf`,
      },
      fakeClassifier(proposal({ confiance_globale: 0.99, anomalies: ["montant_incoherent"] })),
    );

    expect(res.auto_classe).toBe(false);
    const [doc] =
      await sql`SELECT id FROM doc.document WHERE proposition_classement_id = ${res.proposition_id}`;
    expect(doc).toBeUndefined();
  });

  test("aggressive : > 0.80 → auto même avec anomalie", async () => {
    await setPolitique(cabinetA.id, "aggressive");
    const fichier = await seedFichierPhysique(sql, cabinetA.id);

    const res = await classifyDocument(
      {
        cabinet_id: cabinetA.id,
        fichier_physique_id: fichier.id,
        nom_fichier: `${RAISON} relevé.pdf`,
      },
      fakeClassifier(proposal({ confiance_globale: 0.85, anomalies: ["doute_periode"] })),
    );

    expect(res.auto_classe).toBe(true);
    const [doc] =
      await sql`SELECT statut_classement FROM doc.document WHERE id = ${res.document_id}`;
    expect(doc?.statut_classement).toBe("auto");
  });

  test("garde : aucun client rattachable → file, même en aggressive très confiant", async () => {
    await setPolitique(cabinetB.id, "aggressive"); // cabinetB n'a aucun client
    const fichier = await seedFichierPhysique(sql, cabinetB.id);

    const res = await classifyDocument(
      { cabinet_id: cabinetB.id, fichier_physique_id: fichier.id, nom_fichier: "scan-12345.pdf" },
      fakeClassifier(proposal({ confiance_globale: 0.99 })),
    );

    expect(res.auto_classe).toBe(false);
    expect(res.document_id).toBeNull();
    const [prop] =
      await sql`SELECT statut FROM doc.proposition_classement WHERE id = ${res.proposition_id}`;
    expect(prop?.statut).toBe("a_valider");
  });
});
