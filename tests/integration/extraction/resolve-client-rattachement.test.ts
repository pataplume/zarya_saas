/**
 * Rattachement client multi-signal — chemin réel (Bloc B2, ADR 0014).
 *
 * Couvre ce que les tests unitaires (`resolve-client.test.ts`) ne peuvent pas :
 *  1. ANTI-FUITE (règle absolue) — `resolveClientCandidates` est scopé `cabinet_id` :
 *     un client d'un autre cabinet portant le MÊME nom n'est JAMAIS candidat.
 *  2. PERSISTANCE — `classifyDocument` écrit `client_id_propose` + `client_candidats`
 *     dans `doc.proposition_classement` selon le palier (≥0.90 auto / <0.60 manuel).
 *
 * Le `db` applicatif (service role) et le `sql` de test pointent la même base partagée.
 * Aucune I/O réseau : classifier live factice (seam d'injection de classifyDocument).
 *
 * Références :
 * - KICKOFF-BLOCS-B-H.md § BLOC B / B2 · ADR 0014 (seuils) · doc.md §5.1-5.3
 * - packages/extraction/src/resolve-client.ts
 */
import { randomUUID } from "node:crypto";
import {
  type ClassificationResult,
  type Classifier,
  classifyDocument,
  resolveClientCandidates,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
} from "../helpers/seed";

const MODEL = "mistralai/Ministral-3-14B-Instruct-2512";
const PROMPT_VERSION = "ik-classify-v2";

function fakeLiveClassifier(result: ClassificationResult): Classifier {
  return { mode: "live", classify: async () => result };
}

// Proposition de classification minimale (le contenu n'importe pas pour B2, seul le
// rattachement client est sous test ici).
function classifResult(): ClassificationResult {
  return {
    proposal: {
      type: "releve_bancaire",
      categorie: "bancaire",
      libelle: "Relevé",
      periode: "2026-04",
      confiance_globale: 0.9,
      confiance_par_champ: { type: 0.9 },
      anomalies: [],
    },
    model_used: MODEL,
    prompt_version: PROMPT_VERSION,
    duration_ms: 100,
    raw_output: { mode: "live" },
    usage: { tokens_input: 10, tokens_output: 5, cost_usd: "0" },
  };
}

async function insertClient(
  sql: ReturnType<typeof createServiceClient>,
  cabinet_id: string,
  fields: { raison_sociale: string; ide?: string; email_contact?: string },
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO crm.client (id, cabinet_id, raison_sociale, statut, ide, email_contact)
    VALUES (${id}, ${cabinet_id}, ${fields.raison_sociale}, 'actif',
            ${fields.ide ?? null}, ${fields.email_contact ?? null})
  `;
  return id;
}

describe("Rattachement client B2 — anti-fuite & persistance", () => {
  const sql = createServiceClient();
  let cabinet: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const r = await seedTwoCabinets(sql);
    cabinet = r.cabinetA;
    cabinetB = r.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinet.id, cabinetB.id);
    await sql.end();
  });

  test("ANTI-FUITE : un homonyme d'un autre cabinet n'est jamais candidat", async () => {
    const NOM = "Boulangerie Homonyme Test SA";
    const idA = await insertClient(sql, cabinet.id, { raison_sociale: NOM });
    const idB = await insertClient(sql, cabinetB.id, { raison_sociale: NOM });

    const res = await resolveClientCandidates({
      cabinet_id: cabinet.id,
      texte: `Relevé bancaire ${NOM} avril 2026`,
    });

    // Le client du cabinet A est proposé ; celui de B (même nom) est invisible.
    expect(res.client_id_propose).toBe(idA);
    const ids = res.candidats.map((c) => c.client_id);
    expect(ids).toContain(idA);
    expect(ids).not.toContain(idB);
  });

  test("PERSISTANCE : IDE exact → client_id_propose + client_candidats (palier auto)", async () => {
    const ide = "CHE-321.654.987";
    const clientId = await insertClient(sql, cabinet.id, {
      raison_sociale: "Fiduciaire IDE Test Sàrl",
      ide,
    });
    const fichier = await seedFichierPhysique(sql, cabinet.id);

    const { proposition_id } = await classifyDocument(
      {
        cabinet_id: cabinet.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture.pdf",
        ocr_text: `Facture fournisseur — TVA ${ide} — montant CHF 1000`,
        invoked_by_user_id: cabinet.user_id,
      },
      fakeLiveClassifier(classifResult()),
    );

    const [prop] = await sql`
      SELECT client_id_propose, client_candidats
      FROM doc.proposition_classement WHERE id = ${proposition_id}
    `;
    expect(prop?.client_id_propose).toBe(clientId);
    expect(prop?.client_candidats?.palier).toBe("auto");
    expect(prop?.client_candidats?.candidats?.[0]).toMatchObject({
      client_id: clientId,
      raison: "ide_exact",
    });
  });

  test("PERSISTANCE : aucun signal client → client_id_propose NULL, client_candidats NULL", async () => {
    // Un client existe mais son nom n'apparaît pas dans le document.
    await insertClient(sql, cabinet.id, { raison_sociale: "Zephyr Industries Anonyme" });
    const fichier = await seedFichierPhysique(sql, cabinet.id);

    const { proposition_id } = await classifyDocument(
      {
        cabinet_id: cabinet.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "scan_2026.pdf",
        ocr_text: "Document sans aucun indice de rattachement",
        invoked_by_user_id: cabinet.user_id,
      },
      fakeLiveClassifier(classifResult()),
    );

    const [prop] = await sql`
      SELECT client_id_propose, client_candidats
      FROM doc.proposition_classement WHERE id = ${proposition_id}
    `;
    expect(prop?.client_id_propose).toBeNull();
    expect(prop?.client_candidats).toBeNull();
  });
});
