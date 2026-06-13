import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectNatureFichier,
  natureFichierDepuisMime,
  natureSupporteQr,
} from "./detect-nature-fichier";

// Fixtures réelles : un PDF AVEC couche texte (→ pdf_natif) et un PDF SANS texte (→ pdf_scanne).
const PDF_TEXTE = new Uint8Array(
  readFileSync(new URL("./__fixtures__/texte.pdf", import.meta.url)),
);
const PDF_SANS_TEXTE = new Uint8Array(
  readFileSync(new URL("./__fixtures__/minimal.pdf", import.meta.url)),
);

// Quelques octets arbitraires : suffisent pour les cas MIME image / inconnu (pas de parsing).
const OCTETS_QUELCONQUES = new Uint8Array([1, 2, 3, 4, 5]);

describe("detectNatureFichier", () => {
  it("MIME image → photo (sans lire les octets)", async () => {
    expect(await detectNatureFichier(OCTETS_QUELCONQUES, "image/png")).toBe("photo");
    expect(await detectNatureFichier(OCTETS_QUELCONQUES, "image/jpeg")).toBe("photo");
    expect(await detectNatureFichier(OCTETS_QUELCONQUES, "image/webp")).toBe("photo");
    expect(await detectNatureFichier(OCTETS_QUELCONQUES, "image/tiff")).toBe("photo");
  });

  it("PDF avec couche texte exploitable → pdf_natif", async () => {
    expect(await detectNatureFichier(PDF_TEXTE, "application/pdf")).toBe("pdf_natif");
  });

  it("PDF sans texte (scan) → pdf_scanne", async () => {
    expect(await detectNatureFichier(PDF_SANS_TEXTE, "application/pdf")).toBe("pdf_scanne");
  });

  it("MIME inconnu → autre", async () => {
    expect(await detectNatureFichier(OCTETS_QUELCONQUES, "text/csv")).toBe("autre");
    expect(
      await detectNatureFichier(
        OCTETS_QUELCONQUES,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("autre");
  });

  it("octets corrompus présentés comme PDF → autre, sans throw", async () => {
    const corrompu = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0xde, 0xad]); // "%PDF" + garbage
    await expect(detectNatureFichier(corrompu, "application/pdf")).resolves.toBe("autre");
  });

  it("ne mute pas les octets d'entrée (copie passée à unpdf)", async () => {
    const copie = Uint8Array.from(PDF_TEXTE);
    await detectNatureFichier(copie, "application/pdf");
    expect(copie).toEqual(PDF_TEXTE);
  });
});

describe("natureFichierDepuisMime (dégradé, sans octets)", () => {
  it("dérive depuis le seul MIME : image → photo, pdf → pdf_natif (permissif), reste → autre", () => {
    expect(natureFichierDepuisMime("image/png")).toBe("photo");
    expect(natureFichierDepuisMime("application/pdf")).toBe("pdf_natif");
    expect(natureFichierDepuisMime("text/csv")).toBe("autre");
    expect(natureFichierDepuisMime(undefined)).toBe("autre");
  });
});

describe("natureSupporteQr", () => {
  it("PDF/image supportent le QR, autre non", () => {
    expect(natureSupporteQr("pdf_natif")).toBe(true);
    expect(natureSupporteQr("pdf_scanne")).toBe(true);
    expect(natureSupporteQr("photo")).toBe(true);
    expect(natureSupporteQr("autre")).toBe(false);
  });
});
