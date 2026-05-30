// Pipeline de persistance de la classification documentaire.
//
// Sépare la logique pure (classifier.ts, testable sans DB) de la persistance :
//  1. invoque le Classifier (stub ou Infomaniak selon EXTRACTION_MODE)
//  2. trace l'appel dans extraction.invocation (audit + facturation, ADR 0010)
//  3. crée la doc.proposition_classement (pattern proposition → validation, ADR 0007)
// L'entité finale doc.document n'est PAS créée ici : elle naît à la validation
// humaine (Sprint 3.4), jamais automatiquement (doc.md § 11.1).

import { db, invocation, propositionClassement } from "@zarya/db";
import {
  type ClassificationInput,
  ExtractionError,
  type ExtractionMode,
  getClassifier,
  STUB_PROMPT_VERSION,
} from "./classifier";
import { CLASSIFY_DOC_PROMPT_VERSION } from "./prompts/classification-doc";

// Statuts d'invocation (extraction.invocation_status, packages/db/src/schema/extraction.ts).
type InvocationStatus =
  | "success"
  | "validation_error"
  | "timeout"
  | "rate_limit"
  | "ocr_failed"
  | "unknown_error";

// Mappe un échec d'extraction vers le statut d'invocation tracé (audit + quota).
// Pur (pas de DB) → testable isolément. Tout ce qui n'est pas un ExtractionError
// connu retombe sur "unknown_error".
export function mapErrorToInvocationStatus(err: unknown): InvocationStatus {
  if (err instanceof ExtractionError) {
    switch (err.code) {
      case "RATE_LIMIT":
        return "rate_limit";
      case "TIMEOUT":
        return "timeout";
      case "VALIDATION_FAILED":
        return "validation_error";
      case "OCR_FAILED":
        return "ocr_failed";
      default:
        return "unknown_error"; // CONFIG, LLM_ERROR
    }
  }
  return "unknown_error";
}

export interface ClassifyDocumentInput {
  cabinet_id: string;
  fichier_physique_id: string;
  nom_fichier: string;
  taille_octets?: number;
  ocr_text?: string | null;
  type_mime?: string;
  invoked_by_user_id?: string;
}

export interface ClassifyDocumentResult {
  invocation_id: string;
  proposition_id: string;
}

export async function classifyDocument(
  input: ClassifyDocumentInput,
): Promise<ClassifyDocumentResult> {
  const classifier = getClassifier();

  const classificationInput: ClassificationInput = {
    nom_fichier: input.nom_fichier,
    ocr_text: input.ocr_text ?? null,
    ...(input.type_mime ? { type_mime: input.type_mime } : {}),
  };

  let result: Awaited<ReturnType<typeof classifier.classify>>;
  try {
    result = await classifier.classify(classificationInput);
  } catch (err) {
    // Trace l'échec (notamment les 429 après retries épuisés) dans
    // extraction.invocation : sans ça, un quota dépassé ne laisserait aucune
    // trace auditable (ADR 0010 § 7). On RE-LÈVE ensuite l'erreur d'origine —
    // le pipeline d'upload la logge (cf. fix échec silencieux, PR #24).
    await traceFailedInvocation(input, classifier.mode, err);
    throw err;
  }
  const { proposal } = result;

  // 1. Traçabilité de l'invocation (une ligne par appel, même en mode stub).
  const [inv] = await db
    .insert(invocation)
    .values({
      cabinet_id: input.cabinet_id,
      context: "classification_doc",
      invoked_by_module: "doc",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "file",
      input_document_id: input.fichier_physique_id,
      input_size_bytes: input.taille_octets ?? null,
      model_used: result.model_used,
      prompt_version: result.prompt_version,
      status: "success",
      nb_items_extracted: 1,
      nb_items_with_anomalies: proposal.anomalies.length > 0 ? 1 : 0,
      raw_output: result.raw_output,
      total_duration_ms: result.duration_ms,
      // Mode stub : pas d'usage → 0. Mode live (Infomaniak) : tokens réels via
      // result.usage. Coût laissé à 0 tant que la tarification IK n'est pas câblée.
      cost_usd: result.usage?.cost_usd ?? "0",
      tokens_input: result.usage?.tokens_input ?? 0,
      tokens_output: result.usage?.tokens_output ?? 0,
    })
    .returning({ id: invocation.id });

  if (!inv) {
    throw new Error("Échec de l'enregistrement de l'invocation");
  }

  // 2. Proposition en attente de validation humaine.
  const [proposition] = await db
    .insert(propositionClassement)
    .values({
      cabinet_id: input.cabinet_id,
      fichier_physique_id: input.fichier_physique_id,
      extraction_invocation_id: inv.id,
      statut: "a_valider",
      type_propose: proposal.type,
      categorie_proposee: proposal.categorie,
      periode_proposee: proposal.periode,
      libelle_propose: proposal.libelle,
      confiance_globale: proposal.confiance_globale.toFixed(2),
      confiance_par_champ: proposal.confiance_par_champ,
      anomalies_detectees: proposal.anomalies,
    })
    .returning({ id: propositionClassement.id });

  if (!proposition) {
    throw new Error("Échec de l'enregistrement de la proposition");
  }

  return { invocation_id: inv.id, proposition_id: proposition.id };
}

// Écrit une ligne extraction.invocation en échec (best-effort). model_used /
// prompt_version sont remplis au mieux : l'id de modèle résolu n'est pas connu
// quand l'appel échoue, on trace donc le mode et la version de prompt du chemin.
async function traceFailedInvocation(
  input: ClassifyDocumentInput,
  mode: ExtractionMode,
  err: unknown,
): Promise<void> {
  const status = mapErrorToInvocationStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(invocation).values({
      cabinet_id: input.cabinet_id,
      context: "classification_doc",
      invoked_by_module: "doc",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "file",
      input_document_id: input.fichier_physique_id,
      input_size_bytes: input.taille_octets ?? null,
      model_used: mode,
      prompt_version: mode === "live" ? CLASSIFY_DOC_PROMPT_VERSION : STUB_PROMPT_VERSION,
      status,
      nb_items_extracted: 0,
      error_message: message,
    });
  } catch {
    // Échec d'écriture de la trace : on ne masque PAS l'erreur de classification
    // (re-levée par l'appelant). On évite seulement qu'un souci DB secondaire ne
    // remplace la cause réelle remontée à l'upload.
  }
}
