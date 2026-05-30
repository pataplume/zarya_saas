// Extraction du texte EMBARQUÉ d'un PDF (déterministe, gratuit, hors-ligne).
//
// Rôle dans le pipeline OCR (Phase 4.1) :
//   PDF → extractPdfText (texte natif) → quality gate (isPdfTextUsable) →
//   si insuffisant (scan/image) → fallback vision Infomaniak (Stage 2).
//
// Aucun appel réseau, aucun LLM ici : on lit ce que le PDF contient déjà.
// La couche vision n'est sollicitée QUE si la porte qualité échoue.

import { extractText, getDocumentProxy } from "unpdf";

export interface PdfTextResult {
  /** Texte concaténé de toutes les pages (espaces normalisés, trim). */
  text: string;
  /** Nombre de pages du document. */
  nb_pages: number;
}

export interface PdfTextQuality {
  /** true → texte natif suffisant, on saute l'OCR vision. */
  usable: boolean;
  /** Caractères non blancs extraits. */
  total_chars: number;
  /** Densité moyenne de texte par page (indice « scan vs natif »). */
  chars_per_page: number;
}

export interface PdfTextQualityOptions {
  /** Densité minimale de texte par page sous laquelle on suspecte un scan. */
  minCharsPerPage?: number;
  /** Plancher absolu : en dessous, jamais exploitable (doc quasi vide). */
  minTotalChars?: number;
}

// Un PDF natif d'une facture/relevé porte des centaines de caractères par page.
// Un PDF scanné (image) n'en rend quasi aucun (parfois quelques chars de métadonnées).
// Ces seuils séparent les deux mondes ; ajustables au besoin (corpus réel à venir).
const DEFAULT_MIN_CHARS_PER_PAGE = 50;
const DEFAULT_MIN_TOTAL_CHARS = 20;

/** Erreur de parsing PDF (fichier corrompu / illisible), distincte d'un PDF sans texte. */
export class PdfParseError extends Error {
  constructor(
    message: string,
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = "PdfParseError";
  }
}

// Implémentation bas niveau injectable (tests : pas besoin d'un vrai PDF).
export type PdfExtractFn = (bytes: Uint8Array) => Promise<{ text: string; totalPages: number }>;

const unpdfExtract: PdfExtractFn = async (bytes) => {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  // mergePages:true → `text` est une string ; on garde une garde défensive.
  return { text: typeof text === "string" ? text : "", totalPages };
};

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extrait le texte embarqué d'un PDF. Ne lève QUE si le PDF est illisible
 * (corrompu) — un PDF scanné sans texte renvoie simplement `text: ""`.
 */
export async function extractPdfText(
  bytes: Uint8Array,
  extractFn: PdfExtractFn = unpdfExtract,
): Promise<PdfTextResult> {
  let raw: { text: string; totalPages: number };
  try {
    raw = await extractFn(bytes);
  } catch (err) {
    throw new PdfParseError("PDF illisible ou corrompu (échec du parsing).", err);
  }
  return {
    text: normalizeWhitespace(raw.text ?? ""),
    nb_pages: Number.isFinite(raw.totalPages) && raw.totalPages > 0 ? raw.totalPages : 0,
  };
}

/** Compte les caractères non blancs (la vraie « substance » textuelle). */
function countNonWhitespace(text: string): number {
  return text.replace(/\s/g, "").length;
}

/**
 * Porte qualité : décide si le texte natif suffit ou s'il faut basculer en OCR vision.
 * Un PDF scanné (image) tombe sous les seuils → `usable: false` → fallback.
 */
export function isPdfTextUsable(
  result: PdfTextResult,
  opts: PdfTextQualityOptions = {},
): PdfTextQuality {
  const minCharsPerPage = opts.minCharsPerPage ?? DEFAULT_MIN_CHARS_PER_PAGE;
  const minTotalChars = opts.minTotalChars ?? DEFAULT_MIN_TOTAL_CHARS;

  const total = countNonWhitespace(result.text);
  const pages = result.nb_pages > 0 ? result.nb_pages : 1;
  const perPage = total / pages;

  return {
    usable: total >= minTotalChars && perPage >= minCharsPerPage,
    total_chars: total,
    chars_per_page: perPage,
  };
}
