// Persistance de l'OCR (Phase 4.1) : exécute l'extraction de texte (extractText)
// et trace l'appel vision dans extraction.invocation (audit + facturation, ADR 0010).
//
// Séparation des responsabilités, alignée sur classify-document.ts :
//  - ocr.ts = logique PURE (routage natif/vision), testable sans DB ;
//  - ce module = appel + trace invocation. La MISE À JOUR de doc.fichier_physique
//    (ocr_done / ocr_text / ocr_invocation_id / nb_pages) est faite par l'appelant
//    (route upload) qui possède déjà le scope `eq(fichier_physique.id, …)`.
//
// Règle de traçabilité : seul l'OCR **vision** est un appel LLM → 1 ligne invocation.
// Le texte natif PDF est déterministe et gratuit → aucune invocation.

import { db, invocation } from "@zarya/db";
import { infomaniakClient } from "@zarya/integrations";
import { ExtractionError } from "./classifier";
import { mapErrorToInvocationStatus } from "./classify-document";
import {
  type ExtractTextResult,
  extractText,
  OCR_PROMPT_VERSION,
  type OcrSource,
  type VisionModelClient,
} from "./ocr";

export interface OcrDocumentInput {
  cabinet_id: string;
  fichier_physique_id: string;
  bytes: Uint8Array;
  type_mime: string;
  taille_octets?: number;
  invoked_by_user_id?: string;
}

export interface OcrDocumentResult {
  /** Texte exploitable (null si rien). À passer à classifyDocument. */
  ocr_text: string | null;
  /** Origine du texte. */
  source: OcrSource;
  /** Pages connues (PDF), sinon null. */
  nb_pages: number | null;
  /** Id d'invocation vision (null si texte natif / aucun appel LLM). */
  invocation_id: string | null;
}

export async function ocrDocument(
  input: OcrDocumentInput,
  client: VisionModelClient = infomaniakClient,
): Promise<OcrDocumentResult> {
  let result: ExtractTextResult;
  try {
    result = await extractText(
      { cabinet_id: input.cabinet_id, bytes: input.bytes, type_mime: input.type_mime },
      client,
    );
  } catch (err) {
    // Échec réel de l'OCR vision (TIMEOUT / RATE_LIMIT / CONFIG / OCR_FAILED) :
    // on trace puis on relève — l'appelant logge et continue (non bloquant).
    await traceFailedOcr(input, err);
    throw err;
  }

  let invocation_id: string | null = null;

  // Seul l'OCR vision est un appel LLM tracé. Le texte natif PDF ne l'est pas.
  if (result.source === "vision") {
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
        model_used: result.model_used ?? "vision",
        prompt_version: OCR_PROMPT_VERSION,
        ocr_engine: result.model_used ?? null,
        ocr_duration_ms: result.vision_duration_ms ?? null,
        status: "success",
        nb_items_extracted: result.text ? 1 : 0,
        raw_output: result.raw_output ?? null,
        total_duration_ms: result.vision_duration_ms ?? null,
        tokens_input: result.usage?.tokens_input ?? 0,
        tokens_output: result.usage?.tokens_output ?? 0,
        cost_usd: "0",
      })
      .returning({ id: invocation.id });
    invocation_id = inv?.id ?? null;
  }

  return {
    ocr_text: result.text ? result.text : null,
    source: result.source,
    nb_pages: result.nb_pages,
    invocation_id,
  };
}

// Trace best-effort d'un échec OCR vision. N'avale pas l'erreur d'origine
// (relevée par ocrDocument) : on évite seulement qu'un souci DB secondaire ne
// masque la cause réelle remontée à la route.
async function traceFailedOcr(input: OcrDocumentInput, err: unknown): Promise<void> {
  const status = mapErrorToInvocationStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  const isExtraction = err instanceof ExtractionError;
  try {
    await db.insert(invocation).values({
      cabinet_id: input.cabinet_id,
      context: "classification_doc",
      invoked_by_module: "doc",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "file",
      input_document_id: input.fichier_physique_id,
      input_size_bytes: input.taille_octets ?? null,
      model_used: "vision",
      prompt_version: OCR_PROMPT_VERSION,
      ocr_engine: "vision",
      status: isExtraction ? status : "ocr_failed",
      nb_items_extracted: 0,
      error_message: message,
    });
  } catch {
    // souci DB secondaire ignoré : la cause réelle est relevée par l'appelant.
  }
}
