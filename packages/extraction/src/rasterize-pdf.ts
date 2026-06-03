// OCR-a — Rasterisation PDF → images (pré-requis de l'OCR vision : l'API vision Infomaniak
// consomme des IMAGES, pas des PDF). Réf : ocr.ts (routage natif/vision) ; KICKOFF Bloc H (OCR).
//
// Implémentation via `unpdf` (déjà utilisé pour le texte natif) : un SEUL pdfjs vendoré, donc
// aucune collision de version de worker (le piège qui faisait échouer un pdfjs-dist parallèle en
// CI). Le rendu en image utilise @napi-rs/canvas (peer d'unpdf, binaire natif compatible Vercel),
// injecté via `canvasImport`. PUR (pas de DB), server-only.

import { getDocumentProxy, renderPageAsImage } from "unpdf";

const canvasImport = () => import("@napi-rs/canvas");

export interface RasterizeOptions {
  /** Facteur d'échelle de rendu (≈ scale×72 DPI). 2 ≈ 144 DPI : bon compromis lisibilité/poids. */
  scale?: number;
  /** Nombre maximum de pages rendues (borne le coût vision). Défaut 10. */
  maxPages?: number;
}

export interface RasterizedPage {
  /** Numéro de page (1-based). */
  pageNumber: number;
  /** PNG encodé de la page. */
  png: Uint8Array;
  width: number;
  height: number;
}

export interface RasterizeResult {
  pages: RasterizedPage[];
  /** Nombre total de pages du PDF (avant plafonnement `maxPages`). */
  totalPages: number;
  /** true si des pages ont été ignorées à cause de `maxPages`. */
  tronque: boolean;
}

export class RasterizeError extends Error {
  readonly detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "RasterizeError";
    this.detail = detail;
  }
}

/** Lit largeur/hauteur depuis l'en-tête PNG (chunk IHDR : offsets 16/20, big-endian). */
function pngDimensions(png: Uint8Array): { width: number; height: number } {
  if (png.length < 24) return { width: 0, height: 0 };
  const b = (o: number) => png[o] ?? 0;
  const read = (o: number) => (b(o) << 24) | (b(o + 1) << 16) | (b(o + 2) << 8) | b(o + 3);
  return { width: read(16) >>> 0, height: read(20) >>> 0 };
}

/**
 * Rend les pages d'un PDF en PNG. Lève RasterizeError si le PDF est illisible. Rendu séquentiel
 * page par page. Chaque appel reçoit une copie fraîche des octets (pdfjs détache le buffer source).
 */
export async function rasterizePdf(
  bytes: Uint8Array,
  opts: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const scale = opts.scale ?? 2;
  const maxPages = opts.maxPages ?? 10;
  const master = Uint8Array.from(bytes); // copie maîtresse, jamais passée directement

  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(Uint8Array.from(master));
    totalPages = pdf.numPages;
  } catch (err) {
    throw new RasterizeError("PDF illisible (structure invalide).", err);
  }

  const nb = Math.min(totalPages, maxPages);
  const pages: RasterizedPage[] = [];
  for (let i = 1; i <= nb; i++) {
    let buffer: ArrayBuffer;
    try {
      buffer = await renderPageAsImage(Uint8Array.from(master), i, { canvasImport, scale });
    } catch (err) {
      throw new RasterizeError("Échec du rendu d'une page PDF.", err);
    }
    const png = new Uint8Array(buffer);
    const { width, height } = pngDimensions(png);
    pages.push({ pageNumber: i, png, width, height });
  }

  return { pages, totalPages, tronque: totalPages > nb };
}
