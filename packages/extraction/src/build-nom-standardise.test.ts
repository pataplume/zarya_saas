import { describe, expect, test } from "vitest";
import { buildNomStandardise, type NomStandardiseInput, slugify } from "./build-nom-standardise";

function input(over: Partial<NomStandardiseInput>): NomStandardiseInput {
  return {
    type: "releve_bancaire",
    periode: "2026-04",
    client_nom: "Dupont SA",
    libelle: "UBS",
    extension: "pdf",
    document_id: "a1b2c3d4-0000-0000-0000-000000000000",
    ...over,
  };
}

describe("slugify", () => {
  test("minuscule + ASCII + tirets, accents retirés", () => {
    expect(slugify("Dupont SA")).toBe("dupont-sa");
    expect(slugify("Crédit Agricole & Cie")).toBe("credit-agricole-cie");
    expect(slugify("Élevé à l'Œuvre")).toBe("eleve-a-l-uvre");
  });

  test("comprime les séparateurs et trim les tirets de bord", () => {
    expect(slugify("  __foo  / bar__  ")).toBe("foo-bar");
    expect(slugify("a---b")).toBe("a-b");
  });

  test("chaîne sans caractère alphanumérique → vide", () => {
    expect(slugify("***")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("buildNomStandardise (convention ZARYA imposée v1, B6)", () => {
  test("cas nominal mensuel : nom + chemin déterministes", () => {
    const r = buildNomStandardise(input({}));
    expect(r.nom_fichier).toBe("2026-04_releve-bancaire_dupont-sa_ubs__a1b2c3.pdf");
    expect(r.chemin_logique).toBe("2026/04/releve-bancaire/dupont-sa");
  });

  test("déterminisme : mêmes entrées → même sortie", () => {
    expect(buildNomStandardise(input({}))).toEqual(buildNomStandardise(input({})));
  });

  test("période trimestrielle YYYY-QN", () => {
    const r = buildNomStandardise(input({ periode: "2026-Q1" }));
    expect(r.nom_fichier).toBe("2026-t1_releve-bancaire_dupont-sa_ubs__a1b2c3.pdf");
    expect(r.chemin_logique).toBe("2026/t1/releve-bancaire/dupont-sa");
  });

  test("période annuelle YYYY : pas de segment mois", () => {
    const r = buildNomStandardise(input({ periode: "2025" }));
    expect(r.nom_fichier).toBe("2025_releve-bancaire_dupont-sa_ubs__a1b2c3.pdf");
    expect(r.chemin_logique).toBe("2025/releve-bancaire/dupont-sa");
  });

  test("période nulle (ponctuel/inconnu) → fallback sans-periode", () => {
    const r = buildNomStandardise(input({ periode: null }));
    expect(r.nom_fichier).toBe("sans-periode_releve-bancaire_dupont-sa_ubs__a1b2c3.pdf");
    expect(r.chemin_logique).toBe("sans-periode/releve-bancaire/dupont-sa");
  });

  test("champs vides après slug → fallback 'sans', jamais de '__' ni '//'", () => {
    const r = buildNomStandardise(input({ client_nom: "***", libelle: "   " }));
    expect(r.nom_fichier).toBe("2026-04_releve-bancaire_sans_sans__a1b2c3.pdf");
    expect(r.chemin_logique).toBe("2026/04/releve-bancaire/sans");
    expect(r.nom_fichier).not.toContain("___"); // pas de segment vide (le "__" id est voulu)
    expect(r.chemin_logique).not.toContain("//");
  });

  test("extension vide → bin", () => {
    expect(buildNomStandardise(input({ extension: "" })).nom_fichier).toMatch(/\.bin$/);
  });

  test("anti-collision : mêmes champs, documents différents → noms distincts", () => {
    const a = buildNomStandardise(input({ document_id: "aaaaaaaa-0000-0000-0000-000000000000" }));
    const b = buildNomStandardise(input({ document_id: "bbbbbbbb-0000-0000-0000-000000000000" }));
    expect(a.nom_fichier).not.toBe(b.nom_fichier);
    expect(a.nom_fichier).toBe("2026-04_releve-bancaire_dupont-sa_ubs__aaaaaa.pdf");
    expect(b.nom_fichier).toBe("2026-04_releve-bancaire_dupont-sa_ubs__bbbbbb.pdf");
  });

  test("suffixe id = 6 premiers hex sans tirets, minuscule", () => {
    const r = buildNomStandardise(input({ document_id: "AB12CD34-EF56-0000-0000-000000000000" }));
    expect(r.nom_fichier).toContain("__ab12cd.");
  });
});
