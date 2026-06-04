// H2b — Découpage de texte en chunks pour l'indexation RAG. PUR (pas de DB, pas de LLM).
// Réf : search.md §4.2 (~500 tokens / overlap 50) ; ADR 0022. Heuristique en CARACTÈRES
// (≈ 4 car./token → 2000 car. ≈ 500 tokens), sans tokenizer (pas de dépendance), bien sous la
// fenêtre 8192 du modèle. Préserve les frontières de paragraphe quand c'est possible.

export interface ChunkOptions {
  /** Taille cible max d'un chunk en caractères. Défaut 2000 (≈ 500 tokens). */
  maxChars?: number;
  /** Chevauchement (caractères) repris en tête du chunk suivant. Défaut 200 (≈ 50 tokens). */
  overlapChars?: number;
  /** Longueur minimale (après trim) pour conserver un chunk. Défaut 1. */
  minChars?: number;
}

/** Découpe un paragraphe trop long en fenêtres de `max` caractères avec chevauchement. */
function hardSplit(p: string, max: number, overlap: number): string[] {
  const step = Math.max(1, max - overlap);
  const out: string[] = [];
  for (let i = 0; i < p.length; i += step) {
    out.push(p.slice(i, i + max));
    if (i + max >= p.length) break;
  }
  return out;
}

/**
 * Découpe `text` en chunks ~`maxChars` avec chevauchement `overlapChars`, en respectant les
 * frontières de paragraphe (double saut de ligne). Retourne [] pour un texte vide.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 2000;
  const overlapChars = Math.min(opts.overlapChars ?? 200, Math.floor(maxChars / 2));
  const minChars = opts.minChars ?? 1;

  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= maxChars ? [p] : hardSplit(p, maxChars, overlapChars)));

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + 2 + p.length > maxChars) {
      chunks.push(current);
      const tail = overlapChars > 0 ? current.slice(-overlapChars) : "";
      // Ne préfixer le chevauchement que s'il tient sous maxChars (un paragraphe déjà
      // dimensionné à maxChars par hardSplit ne doit pas déborder).
      current = tail && tail.length + 2 + p.length <= maxChars ? `${tail}\n\n${p}` : p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current);

  return chunks.map((c) => c.trim()).filter((c) => c.length >= minChars);
}
