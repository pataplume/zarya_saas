// F6b — Parsing déterministe des fichiers employés uploadés (onboarding-client §3 modes).
// Excel (.xlsx via exceljs) + CSV (natif) → lignes de cellules mappées aux champs canoniques
// ZARYA via normaliserEntete. PUR (hors lecture xlsx async). Réf : onboarding-client-schema.md §4.

import ExcelJS from "exceljs";
import { clefEntete, type NomChamp, normaliserEntete } from "./employe-fields";

/** Une cellule extraite : valeur brute (texte) + sa coordonnée source (B7, A2…). */
export interface CelluleExtraite {
  valeur: string;
  source_cellule: string;
}

/** Une ligne = un employé candidat : champ canonique → cellule. */
export type LigneEmploye = Partial<Record<NomChamp, CelluleExtraite>>;

export interface ParseEmployesResult {
  lignes: LigneEmploye[];
  /** En-têtes bruts reconnus → champ canonique. */
  colonnes_reconnues: Record<string, NomChamp>;
  /** En-têtes bruts non mappés (ignorés, signalés pour debug/template). */
  colonnes_inconnues: string[];
}

/** Type de source supporté par le parseur déterministe. */
export type FormatFichier = "xlsx" | "csv";

/** Détermine le format depuis le type MIME ou l'extension. `null` = non géré ici (PDF/scan). */
export function detecterFormat(
  nom_fichier: string,
  type_mime?: string | null,
): FormatFichier | null {
  const mime = (type_mime ?? "").toLowerCase();
  const nom = nom_fichier.toLowerCase();
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    nom.endsWith(".xlsx") ||
    nom.endsWith(".xls")
  )
    return "xlsx";
  if (mime.includes("csv") || nom.endsWith(".csv")) return "csv";
  return null;
}

// ─── CSV (RFC 4180-ish : séparateur , ou ; ; guillemets ; CRLF/LF) ───────────────
function detecterSeparateur(premiereLigne: string): string {
  const pv = (premiereLigne.match(/;/g) ?? []).length;
  const vg = (premiereLigne.match(/,/g) ?? []).length;
  return pv > vg ? ";" : ",";
}

/** Parse un CSV en matrice de chaînes. Gère les champs quotés contenant le séparateur. */
export function parseCsv(texte: string): string[][] {
  const sansBom = texte.replace(/^﻿/, "");
  const premiere = sansBom.slice(
    0,
    sansBom.search(/\r?\n/) >= 0 ? sansBom.search(/\r?\n/) : undefined,
  );
  const sep = detecterSeparateur(premiere);
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let dansGuillemets = false;
  for (let i = 0; i < sansBom.length; i++) {
    const c = sansBom[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (sansBom[i + 1] === '"') {
          champ += '"';
          i++;
        } else dansGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') dansGuillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else if (c === "\r") {
      // ignoré (CRLF) — le \n suivant clôt la ligne
    } else champ += c;
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((cel) => cel.trim() !== ""));
}

/** Lettre de colonne Excel (1→A, 27→AA) pour la coordonnée source. */
function lettreColonne(index1: number): string {
  let n = index1;
  let s = "";
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ─── Construction des lignes à partir d'une matrice (1re ligne = en-têtes) ───────
function matriceVersLignes(
  matrice: string[][],
  refCellule: (ligneIdx: number, colIdx: number) => string,
): ParseEmployesResult {
  const colonnes_reconnues: Record<string, NomChamp> = {};
  const colonnes_inconnues: string[] = [];
  const entetes = matrice[0] ?? [];
  const mapping: (NomChamp | null)[] = entetes.map((e) => {
    const brut = (e ?? "").trim();
    if (!brut) return null;
    const champ = normaliserEntete(brut);
    if (champ) colonnes_reconnues[brut] = champ;
    else colonnes_inconnues.push(brut);
    return champ;
  });

  const lignes: LigneEmploye[] = [];
  for (let r = 1; r < matrice.length; r++) {
    const cells = matrice[r] ?? [];
    const ligne: LigneEmploye = {};
    let auMoinsUne = false;
    for (let c = 0; c < mapping.length; c++) {
      const champ = mapping[c];
      if (!champ) continue;
      const valeur = (cells[c] ?? "").trim();
      if (valeur === "") continue;
      // Première colonne reconnue gagne (évite l'écrasement par doublon d'en-tête).
      if (ligne[champ]) continue;
      ligne[champ] = { valeur, source_cellule: refCellule(r, c) };
      auMoinsUne = true;
    }
    if (auMoinsUne) lignes.push(ligne);
  }
  return { lignes, colonnes_reconnues, colonnes_inconnues };
}

/** Parse un buffer Excel (.xlsx) — première feuille, 1re ligne = en-têtes. */
export async function parseXlsx(buffer: Buffer | ArrayBuffer): Promise<ParseEmployesResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { lignes: [], colonnes_reconnues: {}, colonnes_inconnues: [] };
  const matrice: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cell.value;
      cells[col - 1] =
        v === null || v === undefined
          ? ""
          : typeof v === "object" && "text" in v
            ? String((v as { text: unknown }).text)
            : v instanceof Date
              ? v.toISOString().slice(0, 10)
              : String(v);
    });
    matrice.push(cells);
  });
  return matriceVersLignes(matrice, (r, c) => `${lettreColonne(c + 1)}${r + 1}`);
}

/** Parse un CSV (texte) — 1re ligne = en-têtes. */
export function parseCsvEmployes(texte: string): ParseEmployesResult {
  const matrice = parseCsv(texte);
  return matriceVersLignes(matrice, (r, c) => `${lettreColonne(c + 1)}${r + 1}`);
}

export interface ParseEmployesInput {
  nom_fichier: string;
  type_mime?: string | null;
  /** Contenu binaire (xlsx) ou texte (csv). */
  buffer?: Buffer | ArrayBuffer;
  texte?: string;
}

/**
 * Parse un fichier employés (xlsx ou csv) vers des lignes mappées. Lève si le format
 * n'est pas géré ici (PDF/scan → extraction LLM, non couverte par le parseur déterministe).
 */
export async function parseEmployesFile(input: ParseEmployesInput): Promise<ParseEmployesResult> {
  const format = detecterFormat(input.nom_fichier, input.type_mime);
  if (format === "csv") {
    const texte =
      input.texte ??
      (input.buffer ? Buffer.from(input.buffer as ArrayBuffer).toString("utf-8") : "");
    return parseCsvEmployes(texte);
  }
  if (format === "xlsx") {
    if (!input.buffer) throw new Error("parseEmployesFile: buffer requis pour un .xlsx");
    return parseXlsx(input.buffer);
  }
  throw new Error(
    `parseEmployesFile: format non géré (${input.nom_fichier}) — PDF/scan = extraction LLM`,
  );
}

// Ré-export utilitaire (utilisé par les tests d'en-têtes).
export { clefEntete };
