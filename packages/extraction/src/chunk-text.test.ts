import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk-text";

describe("chunkText", () => {
  it("retourne [] pour un texte vide ou blanc", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("un texte court tient en un seul chunk", () => {
    const r = chunkText("Bonjour le monde.");
    expect(r).toHaveLength(1);
    expect(r[0]).toBe("Bonjour le monde.");
  });

  it("découpe un long texte en plusieurs chunks respectant maxChars", () => {
    const para = "abcdefghij".repeat(30); // 300 car.
    const text = Array.from({ length: 10 }, () => para).join("\n\n"); // ~3000+ car.
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 800)).toBe(true);
  });

  it("applique un chevauchement entre chunks consécutifs", () => {
    const text = Array.from({ length: 6 }, (_, i) => `Paragraphe ${i} ${"x".repeat(180)}`).join(
      "\n\n",
    );
    const chunks = chunkText(text, { maxChars: 400, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    // Le début du chunk N+1 (issu du chevauchement) provient du chunk N.
    const head = chunks[1]?.slice(0, 40) ?? "";
    expect(head.length).toBeGreaterThan(0);
    expect(chunks[0]?.includes(head)).toBe(true);
  });

  it("découpe un paragraphe unique plus long que maxChars (hard-split)", () => {
    const r = chunkText("z".repeat(5000), { maxChars: 1000, overlapChars: 100 });
    expect(r.length).toBeGreaterThan(1);
    expect(r.every((c) => c.length <= 1000)).toBe(true);
  });
});
