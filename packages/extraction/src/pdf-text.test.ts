import { describe, expect, it, vi } from "vitest";
import { extractPdfText, isPdfTextUsable, type PdfExtractFn, PdfParseError } from "./pdf-text";

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

function fakeExtract(text: string, totalPages: number): PdfExtractFn {
  return vi.fn(async () => ({ text, totalPages }));
}

describe("extractPdfText — extraction texte natif", () => {
  it("renvoie le texte normalisé et le nombre de pages", async () => {
    const fn = fakeExtract("Relevé   UBS\r\n\r\n\r\n  Solde : 1000   CHF  ", 2);
    const res = await extractPdfText(BYTES, fn);
    expect(res.nb_pages).toBe(2);
    expect(res.text).toBe("Relevé UBS\n\nSolde : 1000 CHF");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("un PDF scanné sans texte n'est PAS une erreur (texte vide)", async () => {
    const res = await extractPdfText(BYTES, fakeExtract("", 3));
    expect(res.text).toBe("");
    expect(res.nb_pages).toBe(3);
  });

  it("totalPages invalide → 0 (défensif)", async () => {
    const res = await extractPdfText(BYTES, fakeExtract("x", Number.NaN));
    expect(res.nb_pages).toBe(0);
  });

  it("PDF corrompu (l'extracteur throw) → PdfParseError avec cause", async () => {
    const boom = new Error("invalid xref");
    const fn: PdfExtractFn = vi.fn(async () => {
      throw boom;
    });
    const err = await extractPdfText(BYTES, fn).catch((e) => e);
    expect(err).toBeInstanceOf(PdfParseError);
    expect((err as PdfParseError).originalCause).toBe(boom);
  });
});

describe("isPdfTextUsable — porte qualité (natif vs scan)", () => {
  it("PDF natif dense → usable (on saute l'OCR)", () => {
    const text = "Facture fournisseur ".repeat(20); // ~400 chars
    const q = isPdfTextUsable({ text, nb_pages: 1 });
    expect(q.usable).toBe(true);
    expect(q.chars_per_page).toBeGreaterThan(50);
  });

  it("PDF scanné (texte quasi nul) → non usable → fallback OCR", () => {
    const q = isPdfTextUsable({ text: "p.1", nb_pages: 4 });
    expect(q.usable).toBe(false);
  });

  it("dense sur page 1 mais dilué sur beaucoup de pages → non usable", () => {
    // 300 chars répartis sur 10 pages = 30/page < seuil 50.
    const q = isPdfTextUsable({ text: "a".repeat(300), nb_pages: 10 });
    expect(q.usable).toBe(false);
    expect(q.chars_per_page).toBe(30);
  });

  it("nb_pages=0 traité comme 1 page (pas de division par zéro)", () => {
    const q = isPdfTextUsable({ text: "a".repeat(100), nb_pages: 0 });
    expect(q.chars_per_page).toBe(100);
    expect(q.usable).toBe(true);
  });

  it("seuils configurables", () => {
    const result = { text: "a".repeat(40), nb_pages: 1 };
    expect(isPdfTextUsable(result).usable).toBe(false); // défaut 50
    expect(isPdfTextUsable(result, { minCharsPerPage: 30 }).usable).toBe(true);
  });

  it("compte les caractères NON blancs uniquement", () => {
    const q = isPdfTextUsable({ text: `${"a".repeat(60)}${" ".repeat(500)}`, nb_pages: 1 });
    expect(q.total_chars).toBe(60);
  });
});
