// Détection de la NATURE d'un fichier facture (ADR 0024, sous-bloc 2a) — PUR, best-effort.
//
// Sert au routage de la cascade d'extraction (court-circuit du QR/OCR selon la nature) et à
// la traçabilité. Aucune persistance sensible, aucun appel réseau, aucune dépendance DB.
//
//   image (png/jpeg/webp/tiff) ──────────────────► "photo"
//   PDF ─► couche texte exploitable (unpdf) ─┬─ oui → "pdf_natif"
//                                            └─ non → "pdf_scanne"
//   autre MIME ───────────────────────────────────► "autre"
//
// BEST-EFFORT TOTAL : toute exception (PDF illisible/corrompu) retombe sur "autre" ; cette
// fonction ne lève JAMAIS — l'appelant doit toujours pouvoir continuer la cascade.

import { extractPdfText, isPdfTextUsable } from "./pdf-text";

export type NatureFichier = "pdf_natif" | "pdf_scanne" | "photo" | "autre";

/** Types MIME image traités comme une photo / scan image direct. */
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);

function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}

/**
 * Nature DÉGRADÉE depuis le seul type MIME (sans lire les octets) : utilisée quand les octets
 * ne sont pas disponibles à l'endroit du routage (ex. pipeline qui ne tient que `type_mime`).
 * Un PDF non lu est supposé porter potentiellement un QR → `"pdf_natif"` (valeur permissive
 * pour ne pas court-circuiter le QR à tort). Les images → `"photo"`, le reste → `"autre"`.
 */
export function natureFichierDepuisMime(type_mime: string | undefined): NatureFichier {
  if (type_mime && IMAGE_MIME.has(type_mime)) return "photo";
  if (type_mime && isPdf(type_mime)) return "pdf_natif";
  return "autre";
}

/** Natures pour lesquelles tenter la lecture du QR-bill a du sens (ADR 0024, cascade §1). */
const NATURES_AVEC_QR = new Set<NatureFichier>(["pdf_natif", "pdf_scanne", "photo"]);

/** true si la nature du fichier peut porter un QR-bill (PDF ou image), false pour "autre". */
export function natureSupporteQr(nature: NatureFichier): boolean {
  return NATURES_AVEC_QR.has(nature);
}

/**
 * Détermine la nature d'un fichier à partir de ses octets et de son type MIME.
 *
 * - MIME image (`image/png|jpeg|webp|tiff`) → `"photo"` (pas de lecture des octets nécessaire).
 * - MIME PDF → on extrait la couche texte native (unpdf, déterministe et gratuit) puis on
 *   applique la même porte qualité que l'OCR : texte exploitable → `"pdf_natif"`, sinon
 *   `"pdf_scanne"`.
 * - Tout autre MIME → `"autre"`.
 *
 * Best-effort : un PDF illisible / corrompu retombe sur `"autre"` sans lever.
 */
export async function detectNatureFichier(
  bytes: Uint8Array,
  type_mime: string,
): Promise<NatureFichier> {
  if (IMAGE_MIME.has(type_mime)) {
    return "photo";
  }

  if (isPdf(type_mime)) {
    try {
      // unpdf détache le buffer source : on lui passe une COPIE pour préserver `bytes`
      // (réutilisable par l'appelant pour le QR / l'OCR ensuite).
      const pdf = await extractPdfText(Uint8Array.from(bytes));
      return isPdfTextUsable(pdf).usable ? "pdf_natif" : "pdf_scanne";
    } catch {
      // PDF corrompu / illisible : on ne bloque pas la cascade.
      return "autre";
    }
  }

  return "autre";
}
