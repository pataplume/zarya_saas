// G6a — Génération de l'export salaire (Excel humain + CSV générique). Réf : salaire.md §6 / flow E §7-10.
// MVP (arbitré founder) : formats lisibles, pas de mapping logiciel-spécifique (différé). Enregistre
// salaire.export + passe la période en `exportee`. Prérequis : période validée + revue fiduciaire.

import {
  and,
  db,
  eq,
  evenementSalaire,
  exportSalaire,
  formatExport as formatExportTable,
  isNull,
  periode as periodeTable,
  sql,
} from "@zarya/db";
import ExcelJS from "exceljs";

export interface LignesExport {
  headers: string[];
  rows: string[][];
  nb_employes: number;
}

/** Sérialise une matrice en CSV (séparateur `;`, échappement RFC 4180). PUR. */
export function toCsvSalaire(headers: string[], rows: string[][], sep = ";"): string {
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const ligne = (cells: string[]) => cells.map((c) => esc(c ?? "")).join(sep);
  return [ligne(headers), ...rows.map(ligne)].join("\r\n");
}

/** Construit la matrice employés × types d'éléments d'une période. Scopé cabinet. */
export async function assemblerLignesExport(
  cabinet_id: string,
  periode_id: string,
): Promise<LignesExport> {
  const employes = (await db.execute(sql`
    SELECT e.id, e.prenom, e.nom
    FROM salaire.employe e
    WHERE e.cabinet_id = ${cabinet_id} AND e.client_id = (
      SELECT client_id FROM salaire.periode WHERE id = ${periode_id}
    ) AND e.statut = 'actif' AND e.archived_at IS NULL
    ORDER BY e.nom, e.prenom
  `)) as unknown as Array<{ id: string; prenom: string; nom: string }>;

  const types = (await db.execute(sql`
    SELECT id, code FROM salaire.type_element_paie
    WHERE (cabinet_id IS NULL OR cabinet_id = ${cabinet_id}) AND actif = true
    ORDER BY ordre_affichage, code
  `)) as unknown as Array<{ id: string; code: string }>;

  const elements = (await db.execute(sql`
    SELECT employe_id, type_element_id, valeur_numerique::text AS valeur
    FROM salaire.element_paie WHERE periode_id = ${periode_id} AND cabinet_id = ${cabinet_id}
  `)) as unknown as Array<{ employe_id: string; type_element_id: string; valeur: string | null }>;

  const idx = new Map<string, string>();
  for (const el of elements) idx.set(`${el.employe_id}:${el.type_element_id}`, el.valeur ?? "");

  const headers = ["Nom", "Prénom", ...types.map((t) => t.code)];
  const rows = employes.map((e) => [
    e.nom,
    e.prenom,
    ...types.map((t) => idx.get(`${e.id}:${t.id}`) ?? ""),
  ]);
  return { headers, rows, nb_employes: employes.length };
}

/** Construit un classeur Excel « humain » depuis la matrice. Retourne un Buffer. */
export async function buildExportXlsx(lignes: LignesExport, titre: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(titre.slice(0, 31));
  ws.addRow(lignes.headers);
  for (const r of lignes.rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface GenererExportInput {
  cabinet_id: string;
  periode_id: string;
  format_code: "excel_humain" | "csv_generique";
  genere_par: string;
}

export interface GenererExportResult {
  export_id: string;
  nom_fichier: string;
  contenu_csv?: string;
  lignes: LignesExport;
}

/**
 * Génère l'export d'une période (CSV ou Excel) : enregistre salaire.export, passe la période en
 * `exportee`, journalise. Prérequis : période `validee` + revue fiduciaire effectuée.
 */
export async function genererExportPeriode(
  input: GenererExportInput,
): Promise<GenererExportResult> {
  const [p] = await db
    .select({
      client_id: periodeTable.client_id,
      annee: periodeTable.annee,
      mois: periodeTable.mois,
      statut: periodeTable.statut,
      revue: periodeTable.revue_fiduciaire_at,
    })
    .from(periodeTable)
    .where(
      and(eq(periodeTable.id, input.periode_id), eq(periodeTable.cabinet_id, input.cabinet_id)),
    )
    .limit(1);
  if (!p) throw new Error("Période introuvable.");
  if (p.statut !== "validee" || !p.revue)
    throw new Error("Période non prête à l'export (validation + revue fiduciaire requises).");

  const [fmt] = await db
    .select({ id: formatExportTable.id })
    .from(formatExportTable)
    .where(
      and(
        eq(formatExportTable.code, input.format_code),
        sql`(${formatExportTable.cabinet_id} IS NULL OR ${formatExportTable.cabinet_id} = ${input.cabinet_id})`,
      ),
    )
    .orderBy(isNull(formatExportTable.cabinet_id))
    .limit(1);
  if (!fmt) throw new Error("Format d'export introuvable.");

  const lignes = await assemblerLignesExport(input.cabinet_id, input.periode_id);
  const ext = input.format_code === "csv_generique" ? "csv" : "xlsx";
  const nom_fichier = `salaires_${p.annee}-${String(p.mois).padStart(2, "0")}.${ext}`;
  const contenu_csv =
    input.format_code === "csv_generique" ? toCsvSalaire(lignes.headers, lignes.rows) : undefined;

  const now = new Date();
  const [exp] = await db
    .insert(exportSalaire)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: p.client_id,
      periode_id: input.periode_id,
      format_export_id: fmt.id,
      nom_fichier,
      nb_employes_inclus: lignes.nb_employes,
      nb_lignes_donnees: lignes.rows.length,
      genere_par: input.genere_par,
      statut: "genere",
    })
    .returning({ id: exportSalaire.id });
  if (!exp) throw new Error("Échec de l'enregistrement de l'export.");

  await db
    .update(periodeTable)
    .set({ statut: "exportee", date_export_genere: now, updated_at: now })
    .where(eq(periodeTable.id, input.periode_id));
  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: p.client_id,
    periode_id: input.periode_id,
    type: "export_genere",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.genere_par,
    metadata: { format: input.format_code, nb_employes: lignes.nb_employes },
  });

  return { export_id: exp.id, nom_fichier, ...(contenu_csv ? { contenu_csv } : {}), lignes };
}
