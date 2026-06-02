import { describe, expect, it } from "vitest";
import {
  detectFactureAnomalies,
  type FactureAnomalyInput,
  isValidIde,
} from "./detect-facture-anomalies";

function input(over: Partial<FactureAnomalyInput> = {}): FactureAnomalyInput {
  return {
    iban: null,
    ide: null,
    total_ht: null,
    total_tva: null,
    total_ttc: null,
    montant_a_payer: null,
    taux_tva_principal: null,
    devise: "CHF",
    date_emission: null,
    date_echeance: null,
    ...over,
  };
}

describe("isValidIde (mod-11)", () => {
  it("valide un IDE correct (CHE-116.281.710)", () => {
    expect(isValidIde("CHE-116.281.710")).toBe(true);
    expect(isValidIde("116281710")).toBe(true);
  });

  it("rejette une clé fausse, une longueur fausse, du vide", () => {
    expect(isValidIde("CHE-116.281.711")).toBe(false);
    expect(isValidIde("12345678")).toBe(false);
    expect(isValidIde("")).toBe(false);
  });
});

describe("detectFactureAnomalies (facture.md §5.1)", () => {
  it("aucune anomalie sur une facture saine", () => {
    expect(
      detectFactureAnomalies(
        input({
          iban: "CH9300762011623852957",
          ide: "CHE-116.281.710",
          total_ht: 100,
          total_tva: 8.1,
          total_ttc: 108.1,
          montant_a_payer: 108.1,
          taux_tva_principal: 8.1,
          date_emission: "2026-04-01",
          date_echeance: "2026-04-30",
        }),
      ),
    ).toEqual([]);
  });

  it("iban_invalide (checksum faux)", () => {
    expect(detectFactureAnomalies(input({ iban: "CH9300762011623852958" }))).toContain(
      "iban_invalide",
    );
  });

  it("ide_invalide", () => {
    expect(detectFactureAnomalies(input({ ide: "CHE-000.000.001" }))).toContain("ide_invalide");
  });

  it("tva_incoherente si ttc ≠ ht + tva (±0.01)", () => {
    expect(
      detectFactureAnomalies(input({ total_ht: 100, total_tva: 8.1, total_ttc: 200 })),
    ).toContain("tva_incoherente");
    // tolérance ±0.01 respectée
    expect(
      detectFactureAnomalies(input({ total_ht: 100, total_tva: 8.1, total_ttc: 108.11 })),
    ).not.toContain("tva_incoherente");
  });

  it("taux_tva_invalide hors 0/2.6/3.8/8.1", () => {
    expect(detectFactureAnomalies(input({ taux_tva_principal: 7.7 }))).toContain(
      "taux_tva_invalide",
    );
    expect(detectFactureAnomalies(input({ taux_tva_principal: 2.6 }))).not.toContain(
      "taux_tva_invalide",
    );
  });

  it("devise_inconnue", () => {
    expect(detectFactureAnomalies(input({ devise: "autre" }))).toContain("devise_inconnue");
    expect(detectFactureAnomalies(input({ devise: "EUR" }))).not.toContain("devise_inconnue");
  });

  it("montant_invalide (≤0 ou ≥10M) et montant_eleve (>100k)", () => {
    expect(detectFactureAnomalies(input({ montant_a_payer: 0 }))).toContain("montant_invalide");
    expect(detectFactureAnomalies(input({ montant_a_payer: 12_000_000 }))).toContain(
      "montant_invalide",
    );
    const eleve = detectFactureAnomalies(input({ montant_a_payer: 250_000 }));
    expect(eleve).toContain("montant_eleve");
    expect(eleve).not.toContain("montant_invalide");
  });

  it("dates implausibles", () => {
    expect(detectFactureAnomalies(input({ date_emission: "2010-01-01" }))).toContain(
      "date_emission_implausible",
    );
    expect(
      detectFactureAnomalies(input({ date_emission: "2026-05-10", date_echeance: "2026-05-01" })),
    ).toContain("echeance_avant_emission");
  });

  it("cumule plusieurs anomalies sans doublon", () => {
    const a = detectFactureAnomalies(
      input({ devise: "GBP", taux_tva_principal: 5, montant_a_payer: -1 }),
    );
    expect(a).toEqual(
      expect.arrayContaining(["devise_inconnue", "taux_tva_invalide", "montant_invalide"]),
    );
    expect(new Set(a).size).toBe(a.length);
  });
});
