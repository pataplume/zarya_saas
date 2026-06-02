import { describe, expect, it } from "vitest";
import { type FactureExportRow, genererExportCsv } from "./export-facture-csv";

function row(over: Partial<FactureExportRow> = {}): FactureExportRow {
  return {
    date_emission: "2026-04-15",
    fournisseur: "Swisscom SA",
    numero_facture: "F-001",
    total_ht: 100,
    total_tva: 8.1,
    total_ttc: 108.1,
    devise: "CHF",
    compte_charge: "6000",
    compte_fournisseur: "2000",
    compte_tva: "1170",
    categorie: "telecoms",
    ...over,
  };
}

describe("genererExportCsv (E6)", () => {
  it("en-têtes seules si aucune facture", () => {
    const csv = genererExportCsv([]);
    expect(csv).toBe(
      "Date;Fournisseur;NoFacture;HT;TVA;TTC;Devise;CompteCharge;CompteFournisseur;CompteTVA;Categorie\r\n",
    );
  });

  it("une ligne : montants à 2 décimales, séparateur ;", () => {
    const csv = genererExportCsv([row()]);
    const lignes = csv.trimEnd().split("\r\n");
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toBe(
      "2026-04-15;Swisscom SA;F-001;100.00;8.10;108.10;CHF;6000;2000;1170;telecoms",
    );
  });

  it("échappe les champs contenant le séparateur ou des guillemets", () => {
    const csv = genererExportCsv([row({ fournisseur: 'Du Pont; "Fils" SA' })]);
    expect(csv).toContain('"Du Pont; ""Fils"" SA"');
  });

  it("respecte un séparateur personnalisé", () => {
    const csv = genererExportCsv([row()], ",");
    expect(csv.split("\r\n")[0]).toContain("Date,Fournisseur,NoFacture");
  });

  it("n'expose jamais d'IBAN (aucune colonne IBAN)", () => {
    const csv = genererExportCsv([row()]);
    expect(csv.toUpperCase()).not.toContain("IBAN");
  });
});
