/**
 * Pipeline de classification — trace d'invocation en mode LIVE (clôture Bloc B1).
 *
 * Le chemin live (Infomaniak) est couvert au niveau unité par
 * `infomaniak-classifier.test.ts` (mock du ChatModelClient). Ce qui manquait en CI :
 * la preuve que `classifyDocument()` PERSISTE correctement une invocation live dans
 * `extraction.invocation` (model réel, tokens, coût, prompt_version) ET la proposition
 * dans `doc.proposition_classement` — c'est la DoD B1 (« trace invocation
 * status/coût/tokens/prompt_version ; mapping erreurs 429/timeout/validation »).
 *
 * On n'appelle PAS le réseau : on injecte un Classifier live factice (seam de test de
 * classifyDocument). Tout le reste est réel (db service-role, colonnes, FK).
 *
 * Références :
 * - KICKOFF-BLOCS-B-H.md § BLOC B / B1
 * - packages/extraction/src/classify-document.ts
 * - ADR 0010 § 7 (traçabilité invocation), ADR 0007 (proposition → validation)
 */
import {
  type ClassificationResult,
  type Classifier,
  classifyDocument,
  ExtractionError,
} from "@zarya/extraction";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "../helpers/rls";
import {
  cleanupCabinets,
  seedFichierPhysique,
  seedTwoCabinets,
  type TestCabinet,
  type TestFichierPhysique,
} from "../helpers/seed";

const MODEL = "mistralai/Ministral-3-14B-Instruct-2512";
const PROMPT_VERSION = "ik-classify-v2";

// Classifier live factice : aucune I/O réseau, sortie déterministe. `mode: "live"`
// pour que classifyDocument trace le chemin live (prompt_version live à l'échec).
function fakeLiveClassifier(result: ClassificationResult): Classifier {
  return {
    mode: "live",
    classify: async () => result,
  };
}

function throwingLiveClassifier(err: unknown): Classifier {
  return {
    mode: "live",
    classify: async () => {
      throw err;
    },
  };
}

describe("classifyDocument — trace d'invocation live (B1)", () => {
  const sql = createServiceClient();
  let cabinet: TestCabinet;
  let cabinetB: TestCabinet;

  beforeAll(async () => {
    const result = await seedTwoCabinets(sql);
    cabinet = result.cabinetA;
    cabinetB = result.cabinetB;
  });

  afterAll(async () => {
    await cleanupCabinets(sql, cabinet.id, cabinetB.id);
    await sql.end();
  });

  test("succès live : invocation tracée (model/tokens/coût/prompt_version) + proposition créée", async () => {
    const fichier: TestFichierPhysique = await seedFichierPhysique(sql, cabinet.id);

    const result: ClassificationResult = {
      proposal: {
        type: "releve_bancaire",
        categorie: "bancaire",
        libelle: "Relevé UBS avril 2026",
        periode: "2026-04",
        confiance_globale: 0.9,
        confiance_par_champ: { type: 0.9, categorie: 0.95, periode: 0.8 },
        anomalies: ["type_ambigu"],
      },
      model_used: MODEL,
      prompt_version: PROMPT_VERSION,
      duration_ms: 432,
      raw_output: { mode: "live" },
      usage: { tokens_input: 120, tokens_output: 40, cost_usd: "0.001234" },
    };

    const { invocation_id, proposition_id } = await classifyDocument(
      {
        cabinet_id: cabinet.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "releve_ubs_2026-04.pdf",
        taille_octets: 2048,
        type_mime: "application/pdf",
        ocr_text: "Relevé de compte UBS — avril 2026",
        invoked_by_user_id: cabinet.user_id,
      },
      fakeLiveClassifier(result),
    );

    const [inv] = await sql`
      SELECT cabinet_id, context, invoked_by_module, input_type, input_document_id,
             model_used, prompt_version, status, nb_items_extracted, nb_items_with_anomalies,
             tokens_input, tokens_output, cost_usd, total_duration_ms
      FROM extraction.invocation WHERE id = ${invocation_id}
    `;
    expect(inv?.cabinet_id).toBe(cabinet.id);
    expect(inv?.context).toBe("classification_doc");
    expect(inv?.invoked_by_module).toBe("doc");
    expect(inv?.input_type).toBe("file");
    expect(inv?.input_document_id).toBe(fichier.id);
    expect(inv?.model_used).toBe(MODEL);
    expect(inv?.prompt_version).toBe(PROMPT_VERSION);
    expect(inv?.status).toBe("success");
    expect(inv?.nb_items_extracted).toBe(1);
    expect(inv?.nb_items_with_anomalies).toBe(1);
    expect(inv?.tokens_input).toBe(120);
    expect(inv?.tokens_output).toBe(40);
    expect(inv?.cost_usd).toBe("0.001234");
    expect(inv?.total_duration_ms).toBe(432);

    const [prop] = await sql`
      SELECT cabinet_id, fichier_physique_id, extraction_invocation_id, statut,
             type_propose, categorie_proposee, periode_proposee, libelle_propose,
             confiance_globale, confiance_par_champ, anomalies_detectees
      FROM doc.proposition_classement WHERE id = ${proposition_id}
    `;
    expect(prop?.cabinet_id).toBe(cabinet.id);
    expect(prop?.fichier_physique_id).toBe(fichier.id);
    expect(prop?.extraction_invocation_id).toBe(invocation_id);
    expect(prop?.statut).toBe("a_valider");
    expect(prop?.type_propose).toBe("releve_bancaire");
    expect(prop?.categorie_proposee).toBe("bancaire");
    expect(prop?.periode_proposee).toBe("2026-04");
    expect(prop?.libelle_propose).toBe("Relevé UBS avril 2026");
    expect(prop?.confiance_globale).toBe("0.90");
    expect(prop?.confiance_par_champ).toEqual({ type: 0.9, categorie: 0.95, periode: 0.8 });
    expect(prop?.anomalies_detectees).toEqual(["type_ambigu"]);
  });

  test("échec live (429) : trace rate_limit PUIS repli stub → proposition créée (doc non perdu)", async () => {
    const fichier: TestFichierPhysique = await seedFichierPhysique(sql, cabinet.id);

    // Robustesse : un échec live ne lève PLUS — repli sur le stub pour ne pas perdre le doc.
    const res = await classifyDocument(
      {
        cabinet_id: cabinet.id,
        fichier_physique_id: fichier.id,
        nom_fichier: "facture_2026.pdf",
        taille_octets: 1024,
        type_mime: "application/pdf",
        ocr_text: "Facture fournisseur",
        invoked_by_user_id: cabinet.user_id,
      },
      throwingLiveClassifier(new ExtractionError("RATE_LIMIT", "429 quota Beta")),
    );
    expect(res.proposition_id).toBeTruthy();

    // Deux invocations tracées pour ce fichier : échec live (rate_limit) + succès stub (repli).
    const invs = (await sql`
      SELECT model_used, status, error_message
      FROM extraction.invocation WHERE input_document_id = ${fichier.id}
    `) as unknown as { model_used: string; status: string; error_message: string | null }[];
    expect(invs).toHaveLength(2);
    const live = invs.find((i) => i.model_used === "live");
    const stub = invs.find((i) => i.model_used === "stub");
    expect(live?.status).toBe("rate_limit");
    expect(live?.error_message).toContain("429");
    expect(stub?.status).toBe("success");

    // Une proposition (issue du repli stub) existe → le doc reste visible et validable.
    const props = await sql`
      SELECT id FROM doc.proposition_classement WHERE fichier_physique_id = ${fichier.id}
    `;
    expect(props).toHaveLength(1);
  });
});
