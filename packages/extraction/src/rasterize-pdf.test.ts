// OCR-a — tests de la rasterisation PDF → PNG (pdfjs v4 legacy + @napi-rs/canvas).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RasterizeError, rasterizePdf } from "./rasterize-pdf";

const MINIMAL_PDF = new Uint8Array(
  readFileSync(new URL("./__fixtures__/minimal.pdf", import.meta.url)),
);

describe("rasterizePdf", () => {
  it("rend une page PDF en PNG (dimensions et octets cohérents)", async () => {
    const res = await rasterizePdf(MINIMAL_PDF, { scale: 2 });
    expect(res.totalPages).toBe(1);
    expect(res.tronque).toBe(false);
    expect(res.pages).toHaveLength(1);
    const [page] = res.pages;
    expect(page?.pageNumber).toBe(1);
    expect(page?.width).toBeGreaterThan(0);
    expect(page?.height).toBeGreaterThan(0);
    // En-tête PNG (\x89PNG) + taille non triviale.
    expect(page?.png.length).toBeGreaterThan(100);
    expect(Array.from(page?.png.slice(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("le facteur d'échelle augmente la résolution rendue", async () => {
    const small = await rasterizePdf(MINIMAL_PDF, { scale: 1 });
    const big = await rasterizePdf(MINIMAL_PDF, { scale: 3 });
    expect(big.pages[0]?.width ?? 0).toBeGreaterThan(small.pages[0]?.width ?? 0);
  });

  it("maxPages plafonne le nombre de pages rendues", async () => {
    const res = await rasterizePdf(MINIMAL_PDF, { maxPages: 1 });
    expect(res.pages.length).toBeLessThanOrEqual(1);
  });

  it("lève RasterizeError sur des octets non-PDF", async () => {
    await expect(rasterizePdf(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toBeInstanceOf(
      RasterizeError,
    );
  });
});
