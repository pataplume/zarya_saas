// F6b — parsing déterministe CSV + XLSX (round-trip exceljs).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  detecterFormat,
  parseCsvEmployes,
  parseEmployesFile,
  parseXlsx,
} from "./parse-employes-file";

describe("detecterFormat", () => {
  it("détecte xlsx/csv par MIME ou extension, null sinon", () => {
    expect(detecterFormat("export.xlsx")).toBe("xlsx");
    expect(
      detecterFormat("x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("xlsx");
    expect(detecterFormat("liste.csv")).toBe("csv");
    expect(detecterFormat("x", "text/csv")).toBe("csv");
    expect(detecterFormat("contrat.pdf", "application/pdf")).toBeNull();
  });
});

describe("parseCsvEmployes", () => {
  it("mappe les en-têtes FR et extrait les lignes avec coordonnées", () => {
    const csv =
      "Prénom;Nom;N° AVS;Salaire mensuel\nJean;Dupont;756.1234.5678.97;6500\nMarie;Müller;;5200";
    const r = parseCsvEmployes(csv);
    expect(r.colonnes_reconnues).toMatchObject({ Prénom: "prenom", "N° AVS": "numero_avs" });
    expect(r.lignes).toHaveLength(2);
    expect(r.lignes[0]?.prenom).toEqual({ valeur: "Jean", source_cellule: "A2" });
    expect(r.lignes[0]?.numero_avs?.valeur).toBe("756.1234.5678.97");
    expect(r.lignes[0]?.salaire_base_mensuel?.valeur).toBe("6500");
    // Marie n'a pas d'AVS → champ absent (sera 'manquant' à l'extraction).
    expect(r.lignes[1]?.numero_avs).toBeUndefined();
  });

  it("détecte le séparateur virgule et gère les guillemets", () => {
    const csv = 'Prenom,Nom,Fonction\n"Anne","De, La Tour","Cheffe, RH"';
    const r = parseCsvEmployes(csv);
    expect(r.lignes[0]?.nom?.valeur).toBe("De, La Tour");
    expect(r.lignes[0]?.fonction?.valeur).toBe("Cheffe, RH");
  });

  it("signale les colonnes inconnues sans planter", () => {
    const r = parseCsvEmployes("Prenom;Hobby\nJean;Vélo");
    expect(r.colonnes_inconnues).toContain("Hobby");
    expect(r.lignes[0]?.prenom?.valeur).toBe("Jean");
  });
});

describe("parseXlsx (round-trip exceljs)", () => {
  it("parse un classeur .xlsx réel (1re feuille, en-têtes en ligne 1)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Employés");
    ws.addRow(["Vorname", "Nachname", "AHV-Nr.", "Eintritt"]);
    ws.addRow(["Hans", "Meier", "756.9999.8888.77", "2024-01-15"]);
    const buffer = await wb.xlsx.writeBuffer();

    const r = await parseXlsx(buffer);
    expect(r.colonnes_reconnues).toMatchObject({ Vorname: "prenom", "AHV-Nr.": "numero_avs" });
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]?.prenom?.valeur).toBe("Hans");
    expect(r.lignes[0]?.numero_avs?.valeur).toBe("756.9999.8888.77");
    expect(r.lignes[0]?.date_entree?.valeur).toBe("2024-01-15");
  });
});

describe("parseEmployesFile (dispatch)", () => {
  it("route csv via texte et lève sur format non géré", async () => {
    const r = await parseEmployesFile({ nom_fichier: "x.csv", texte: "Prenom\nJean" });
    expect(r.lignes[0]?.prenom?.valeur).toBe("Jean");
    await expect(
      parseEmployesFile({ nom_fichier: "scan.pdf", buffer: new ArrayBuffer(0) }),
    ).rejects.toThrow(/format non géré/);
  });
});
