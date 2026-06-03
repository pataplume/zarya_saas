// OCR-a — Rasterisation PDF → images (pré-requis de l'OCR vision : l'API vision Infomaniak
// consomme des IMAGES, pas des PDF). Réf : ocr.ts (routage natif/vision) ; KICKOFF Bloc H (OCR).
//
// Stack (arbitré founder) : pdfjs-dist v4 (build `legacy`, stable côté Node serverless) +
// @napi-rs/canvas (binaire pré-compilé compatible Vercel). pdfjs requiert des globals navigateur
// (DOMMatrix/Path2D/ImageData) en Node → polyfillés depuis @napi-rs/canvas avant tout import pdfjs.
//
// PUR (pas de DB). Borne le coût/charge : `maxPages` plafonne le nombre de pages rendues.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const PDFJS_ENTRY = "pdfjs-dist/legacy/build/pdf.mjs";
const PDFJS_WORKER = "pdfjs-dist/legacy/build/pdf.worker.mjs";

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

let polyfilled = false;
// biome-ignore lint/suspicious/noExplicitAny: chargement dynamique d'un module sans types exportés stables.
let pdfjsModule: any = null;

/** Installe les globals navigateur requis par pdfjs (idempotent) + charge le module pdfjs. */
// biome-ignore lint/suspicious/noExplicitAny: cf. ci-dessus.
async function loadPdfjs(): Promise<any> {
  if (!polyfilled) {
    const canvas = await import("@napi-rs/canvas");
    for (const key of ["DOMMatrix", "Path2D", "ImageData"] as const) {
      const g = globalThis as Record<string, unknown>;
      if (canvas[key] && g[key] === undefined) g[key] = canvas[key];
    }
    polyfilled = true;
  }
  if (!pdfjsModule) {
    const pdfjs = await import(PDFJS_ENTRY);
    // Force pdfjs à utiliser SON worker (même version) : sans cela, un autre pdfjs hoisté dans
    // le monorepo (ex. celui embarqué par `unpdf`) peut booter un worker de version différente
    // → « API version does not match the Worker version ». On résout le worker depuis CE module.
    try {
      const require = createRequire(import.meta.url);
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve(PDFJS_WORKER)).href;
    } catch {
      // import.meta/createRequire indisponible : on laisse pdfjs gérer (best effort).
    }
    pdfjsModule = pdfjs;
  }
  return pdfjsModule;
}

/**
 * Rend les pages d'un PDF en PNG. Lève RasterizeError si le PDF est illisible. Le rendu est
 * séquentiel page par page (pdfjs n'est pas thread-safe sur un même document).
 */
export async function rasterizePdf(
  bytes: Uint8Array,
  opts: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const scale = opts.scale ?? 2;
  const maxPages = opts.maxPages ?? 10;

  const pdfjs = await loadPdfjs();
  const { createCanvas } = await import("@napi-rs/canvas");

  let doc: { numPages: number; getPage: (n: number) => Promise<unknown>; destroy: () => void };
  try {
    // Copie en Uint8Array « propre » (pdfjs prend possession du buffer).
    const data = new Uint8Array(bytes);
    doc = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  } catch (err) {
    throw new RasterizeError("PDF illisible (structure invalide).", err);
  }

  const totalPages = doc.numPages;
  const nb = Math.min(totalPages, maxPages);
  const pages: RasterizedPage[] = [];
  try {
    for (let i = 1; i <= nb; i++) {
      // biome-ignore lint/suspicious/noExplicitAny: API pdfjs sans types stables.
      const page = (await doc.getPage(i)) as any;
      const viewport = page.getViewport({ scale });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      page.cleanup();
      pages.push({ pageNumber: i, png: canvas.toBuffer("image/png"), width, height });
    }
  } catch (err) {
    throw new RasterizeError("Échec du rendu d'une page PDF.", err);
  } finally {
    doc.destroy();
  }

  return { pages, totalPages, tronque: totalPages > nb };
}
