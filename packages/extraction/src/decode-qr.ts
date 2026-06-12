// Lecteur d'image QR — couche 1 du décodage QR-bill (ADR 0020), Lot 1.
//
// Transforme des octets de document (PDF ou image) en payload SPC brut (texte), en lisant
// le QR 2D présent sur le bulletin de paiement. PUR : aucune dépendance Supabase, aucune DB.
// Les octets sont injectés par l'appelant (apps/web télécharge depuis Storage). Le payload
// extrait est TRANSITOIRE — il n'est jamais persisté ici (il contient un IBAN en clair :
// interdit au repos, ADR 0013). Le parsing/validation du payload reste dans `./qr-bill`.
//
// Décodage image : `@napi-rs/canvas` rend le PNG en ImageData RGBA (même infra que l'OCR
// vision, cf. ocr.ts / rasterize-pdf.ts), puis `jsqr` lit le QR depuis les pixels.
//
// BEST-EFFORT TOTAL : toute exception (PDF illisible, page corrompue, canvas) est catchée →
// null. Le pipeline facture doit toujours pouvoir continuer sur le fallback IA (E3).

import jsQR from "jsqr";
import type { QrDocumentSource, QrPayloadExtractor } from "./qr-bill";

// Import dynamique du binaire natif Skia (comme rasterize-pdf.ts) : le `.node` n'est pas
// bundlable par webpack ; on le charge à la demande, côté serveur uniquement.
const canvasImport = () => import("@napi-rs/canvas");

/** Types MIME image lus directement comme une seule « page » (sans rasterisation PDF). */
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);

function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}

/** Décode une image encodée (PNG/JPEG/…) en ImageData RGBA via @napi-rs/canvas. */
async function imageBytesToImageData(
  bytes: Uint8Array,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const { createCanvas, loadImage } = await canvasImport();
    const img = await loadImage(Buffer.from(bytes));
    const width = img.width;
    const height = img.height;
    if (width <= 0 || height <= 0) return null;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    // jsQR veut un Uint8ClampedArray ; @napi-rs/canvas renvoie déjà ce type pour .data.
    return {
      data: imageData.data as unknown as Uint8ClampedArray,
      width,
      height,
    };
  } catch {
    return null;
  }
}

/** Tente de lire un QR depuis une page image déjà décodée. Renvoie le payload brut ou null. */
function scanImageData(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): string | null {
  try {
    const result = jsQR(image.data, image.width, image.height);
    const data = result?.data;
    return data ? data : null;
  } catch {
    return null;
  }
}

/**
 * Lit le payload SPC brut d'un QR-bill depuis les octets d'un document.
 *
 * - PDF : rasterise un sous-ensemble BORNÉ de pages (les 2 premières + la dernière — le
 *   bulletin de paiement vit en pratique au début ou en fin) et scanne chacune ; renvoie au
 *   premier QR trouvé.
 * - Image (`image/png|jpeg|webp|tiff`) : traite les octets comme une seule page.
 *
 * Renvoie le payload (chaîne SPC, à parser via `parseSwissQrBill`) ou `null` si aucun QR n'est
 * trouvé. BEST-EFFORT : ne lève JAMAIS — toute erreur devient `null` (→ fallback IA E3).
 */
export async function decodeQrFromImageBytes(
  bytes: Uint8Array,
  type_mime: string,
): Promise<string | null> {
  try {
    if (isPdf(type_mime)) {
      return await decodeQrFromPdf(bytes);
    }
    if (IMAGE_MIME.has(type_mime)) {
      const image = await imageBytesToImageData(bytes);
      return image ? scanImageData(image) : null;
    }
    // Type non géré (xlsx/csv/doc…) : pas de QR à lire.
    return null;
  } catch {
    return null;
  }
}

/**
 * Rasterise + scanne un sous-ensemble borné de pages d'un PDF : les 2 premières + la dernière.
 * Le QR-bill suisse est un bulletin de paiement positionné en pratique en tête ou en pied de
 * facture ; ce sous-ensemble borne le coût de rasterisation sans manquer les cas usuels.
 */
async function decodeQrFromPdf(bytes: Uint8Array): Promise<string | null> {
  const { rasterizePdf } = await import("./rasterize-pdf");

  // 1ʳᵉ passe : on rend les 2 premières pages (maxPages=2) et on scanne.
  let totalPages = 0;
  try {
    const head = await rasterizePdf(bytes, { scale: 2, maxPages: 2 });
    totalPages = head.totalPages;
    for (const page of head.pages) {
      const payload = await scanRasterizedPage(page.png);
      if (payload !== null) return payload;
    }
  } catch {
    return null;
  }

  // 2ᵉ passe : la dernière page (si le PDF en compte plus de 2 — sinon déjà couverte).
  if (totalPages > 2) {
    try {
      // rasterizePdf rend toujours [1..maxPages] ; pour n'avoir QUE la dernière, on rend
      // jusqu'à totalPages et on ne scanne que la page finale (coût accepté : QR rare en fin).
      const full = await rasterizePdf(bytes, { scale: 2, maxPages: totalPages });
      const last = full.pages[full.pages.length - 1];
      if (last) {
        const payload = await scanRasterizedPage(last.png);
        if (payload !== null) return payload;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/** Décode un PNG rasterisé en ImageData puis y scanne un QR. */
async function scanRasterizedPage(png: Uint8Array): Promise<string | null> {
  const image = await imageBytesToImageData(png);
  return image ? scanImageData(image) : null;
}

/**
 * Extracteur QR prêt à l'emploi pour le seam `decodeQrFromDocument`. Utilise les octets déjà
 * en mémoire dans la source (`source.bytes`) et son `type_mime` (champ additif de
 * `QrDocumentSource`, défaut PDF). Sans octets → null (→ fallback IA, comportement inchangé).
 */
export const imageQrPayloadExtractor: QrPayloadExtractor = async (source: QrDocumentSource) =>
  source.bytes ? decodeQrFromImageBytes(source.bytes, source.type_mime ?? "application/pdf") : null;
