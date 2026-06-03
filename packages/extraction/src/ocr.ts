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
    // unpdf détache le buffer source : on lui passe une COPIE pour préserver input.bytes
    // (réutilisé par la rasterisation si le PDF est scanné).
    const pdf = await extractPdfText(Uint8Array.from(input.bytes));
    const quality = isPdfTextUsable(pdf, opts.quality);
    if (quality.usable) {
      return {
        text: pdf.text,
        source: "pdf_natif",
        nb_pages: pdf.nb_pages || null,
        needs_image_ocr: false,
      };
    }
    // PDF scanné (pas de texte natif exploitable). Si un client vision est fourni : on
    // rasterise les pages et on OCR chacune. Sinon, non bloquant (needs_image_ocr).
    if (client) {
      return await visionOcrScannedPdf(input, client, opts);
    }
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

// Nombre maximum de pages OCRisées pour un PDF scanné (borne le coût vision).
const OCR_MAX_PAGES = 15;

// OCR vision d'UNE image (bytes + mime). Lève une ExtractionError mappée en cas d'échec.
async function visionOcrImage(
  bytes: Uint8Array,
  mime: string,
  model: string,
  client: VisionModelClient,
  opts: ExtractTextOptions,
): Promise<IkChatCompletionResponse> {
  const dataUrl = bytesToDataUrl(bytes, mime);
  try {
    return await client.chatCompletion({
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
}

function usageFrom(response: IkChatCompletionResponse): {
  tokens_input: number;
  tokens_output: number;
} {
  return {
    tokens_input: response.usage?.prompt_tokens ?? 0,
    tokens_output: response.usage?.completion_tokens ?? 0,
  };
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

  const start = Date.now();
  const response = await visionOcrImage(input.bytes, input.type_mime, model, client, opts);
  const text = (response.choices[0]?.message?.content ?? "").trim();
  return {
    text,
    source: "vision",
    nb_pages: 1,
    needs_image_ocr: false,
    model_used: model,
    vision_duration_ms: Date.now() - start,
    raw_output: response,
    usage: usageFrom(response),
  };
}

// OCR d'un PDF scanné : rasterise les pages (import dynamique de rasterize-pdf, server-only —
// hors barrel pour ne pas tirer le binaire canvas dans le bundle client) puis OCR chaque page.
async function visionOcrScannedPdf(
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

  const start = Date.now();
  const { rasterizePdf } = await import("./rasterize-pdf");
  let raster: Awaited<ReturnType<typeof rasterizePdf>>;
  try {
    raster = await rasterizePdf(input.bytes, { scale: 2, maxPages: OCR_MAX_PAGES });
  } catch (err) {
    throw new ExtractionError("OCR_FAILED", "Rasterisation du PDF scanné échouée.", err);
  }

  const textes: string[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let lastRaw: IkChatCompletionResponse | undefined;
  for (const page of raster.pages) {
    const response = await visionOcrImage(page.png, "image/png", model, client, opts);
    textes.push((response.choices[0]?.message?.content ?? "").trim());
    const u = usageFrom(response);
    tokensIn += u.tokens_input;
    tokensOut += u.tokens_output;
    lastRaw = response;
  }

  return {
    text: textes.join("\n\n").trim(),
    source: "vision",
    nb_pages: raster.totalPages,
    needs_image_ocr: false,
    model_used: model,
    vision_duration_ms: Date.now() - start,
    usage: { tokens_input: tokensIn, tokens_output: tokensOut },
    ...(lastRaw ? { raw_output: lastRaw } : {}),
  };
}
