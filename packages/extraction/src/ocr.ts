// Wrapper OCR unifié (Phase 4.1) : transforme un fichier en texte exploitable,
// au moindre coût, en suivant le routage validé :
//
//   PDF  ──► texte natif (unpdf)  ──► porte qualité ─┬─ suffisant  → source "pdf_natif"
//                                                    └─ insuffisant → besoin image (différé)
//   image ─────────────────────────────────────────► vision Infomaniak → source "vision"
//
// Principes :
//  - Le texte natif est déterministe et GRATUIT : aucun appel LLM, aucune invocation.
//  - La vision (catégorie `vision`, souveraineté CH) n'est sollicitée QUE pour les
//    images, et seulement si nécessaire.
//  - ⚠️ Limite connue : l'API vision IK consomme des IMAGES, pas des PDF. Un PDF
//    *scanné* (porte qualité en échec) exige une rasterisation page→image — dépendance
//    plus lourde, **différée** (cf. tâche dédiée). On renvoie alors `needs_image_ocr`
//    sans bloquer : la classification retombe sur le nom de fichier.
//  - Cette couche est PURE (pas de DB) : l'appelant (route upload) persiste l'invocation
//    et met à jour `doc.fichier_physique`. Les champs de traçabilité (modèle, usage,
//    durée) sont renvoyés pour la vision.

import type { IkChatCompletionParams, IkChatCompletionResponse } from "@zarya/integrations";
import { InfomaniakError } from "@zarya/integrations";
import { ExtractionError } from "./classifier";
import { extractPdfText, isPdfTextUsable, type PdfTextQualityOptions } from "./pdf-text";

// Sous-ensemble du client Infomaniak nécessaire à l'OCR vision (injectable en test).
export interface VisionModelClient {
  resolveModel(category: "vision"): Promise<string>;
  chatCompletion(params: IkChatCompletionParams): Promise<IkChatCompletionResponse>;
}

export type OcrSource = "pdf_natif" | "vision" | "aucune";

export interface ExtractTextInput {
  cabinet_id: string;
  bytes: Uint8Array;
  type_mime: string;
}

export interface ExtractTextResult {
  /** Texte extrait (vide si scan non rasterisé / image illisible). */
  text: string;
  /** Origine du texte : natif PDF, vision IK, ou aucune (rien d'exploitable). */
  source: OcrSource;
  /** Nombre de pages si connu (PDF), sinon null. */
  nb_pages: number | null;
  /**
   * true si le document est un PDF scanné sans texte natif : il faudrait le
   * rasteriser en image pour l'OCR vision (différé). Non bloquant.
   */
  needs_image_ocr: boolean;
  /** Modèle vision réellement utilisé (source "vision" uniquement). */
  model_used?: string;
  /** Tokens consommés (source "vision" uniquement) — pour `extraction.invocation`. */
  usage?: { tokens_input: number; tokens_output: number };
  /** Durée de l'appel vision en ms (source "vision" uniquement). */
  vision_duration_ms?: number;
  /** Réponse brute IK (source "vision" uniquement) — tracée dans invocation.raw_output. */
  raw_output?: IkChatCompletionResponse;
}

// Version du prompt OCR vision (tracée dans extraction.invocation.prompt_version).
export const OCR_PROMPT_VERSION = "ik-ocr-v1";

export interface ExtractTextOptions {
  /** Seuils de la porte qualité du texte natif PDF. */
  quality?: PdfTextQualityOptions;
  /** Plafond de tokens de sortie pour la transcription vision. */
  maxTokens?: number;
}

const VISION_MAX_TOKENS = 2048;

// Formats image acceptés par l'API vision (data URL base64).
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const OCR_SYSTEM_PROMPT =
  "Tu es un moteur OCR. Transcris FIDÈLEMENT et INTÉGRALEMENT le texte visible du " +
  "document, en conservant l'ordre de lecture. N'invente rien. Si une zone est illisible, " +
  "écris [illisible]. Réponds uniquement par le texte transcrit.";

function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  // Node + edge : Buffer dispo côté serveur (cette couche n'est jamais chargée côté client).
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${mime};base64,${b64}`;
}

// Mappe une erreur Infomaniak vers une ExtractionError OCR. Les 429/timeout gardent
// leur sémantique (retry/quota), le reste devient OCR_FAILED.
function mapVisionError(err: unknown): ExtractionError {
  if (err instanceof InfomaniakError) {
    if (err.code === "timeout") return new ExtractionError("TIMEOUT", err.message, err);
    if (err.code === "rate_limit") return new ExtractionError("RATE_LIMIT", err.message, err);
    if (err.code === "config") return new ExtractionError("CONFIG", err.message, err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ExtractionError("OCR_FAILED", `Échec de l'OCR vision : ${message}`, err);
}

/**
 * Extrait le texte d'un fichier. Ne lève que pour un échec réel de la vision
 * (TIMEOUT / RATE_LIMIT / CONFIG / OCR_FAILED). Un PDF scanné non rasterisé ou un
 * type non supporté ne lèvent PAS : ils renvoient un résultat exploitable
 * (`source: "aucune"`/`needs_image_ocr`) que l'appelant traite sans bloquer.
 */
export async function extractText(
  input: ExtractTextInput,
  client?: VisionModelClient,
  opts: ExtractTextOptions = {},
): Promise<ExtractTextResult> {
  if (isPdf(input.type_mime)) {
    const pdf = await extractPdfText(input.bytes);
    const quality = isPdfTextUsable(pdf, opts.quality);
    if (quality.usable) {
      return {
        text: pdf.text,
        source: "pdf_natif",
        nb_pages: pdf.nb_pages || null,
        needs_image_ocr: false,
      };
    }
    // PDF scanné : rasterisation page→image requise pour la vision (différé).
    return {
      text: pdf.text, // souvent vide ; conservé si quelques bribes natives
      source: "aucune",
      nb_pages: pdf.nb_pages || null,
      needs_image_ocr: true,
    };
  }

  if (IMAGE_MIME.has(input.type_mime)) {
    if (!client) {
      throw new ExtractionError(
        "CONFIG",
        "OCR vision requis pour une image mais aucun client vision fourni.",
      );
    }
    return await visionOcr(input, client, opts);
  }

  // Type non géré par l'OCR (xlsx/csv parsés ailleurs, etc.) : pas d'erreur.
  return { text: "", source: "aucune", nb_pages: null, needs_image_ocr: false };
}

async function visionOcr(
  input: ExtractTextInput,
  client: VisionModelClient,
  opts: ExtractTextOptions,
): Promise<ExtractTextResult> {
  let model: string;
  try {
    model = await client.resolveModel("vision");
  } catch (err) {
    throw mapVisionError(err);
  }

  const dataUrl = bytesToDataUrl(input.bytes, input.type_mime);
  const start = Date.now();

  let response: IkChatCompletionResponse;
  try {
    response = await client.chatCompletion({
      model,
      temperature: 0,
      max_tokens: opts.maxTokens ?? VISION_MAX_TOKENS,
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcris ce document." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
  } catch (err) {
    throw mapVisionError(err);
  }

  const text = (response.choices[0]?.message?.content ?? "").trim();
  const usage = response.usage;
  return {
    text,
    source: "vision",
    nb_pages: 1,
    needs_image_ocr: false,
    model_used: model,
    vision_duration_ms: Date.now() - start,
    raw_output: response,
    ...(usage
      ? {
          usage: {
            tokens_input: usage.prompt_tokens ?? 0,
            tokens_output: usage.completion_tokens ?? 0,
          },
        }
      : {}),
  };
}
