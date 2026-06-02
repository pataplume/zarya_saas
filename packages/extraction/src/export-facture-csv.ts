// Export comptable des factures validées (Bloc E6, facture.md §7).
//
// MVP : un CSV GÉNÉRIQUE (UTF-8, séparateur `;`, ouvrable Excel/import compta), mapping
// appliqué via facture.mapping_export (compte fournisseur, compte TVA par taux). Les formats
// exacts par logiciel (Crésus/WinBIZ/Abacus XML…) sont DIFFÉRÉS (colonnes « à valider en
// interview », facture.md §7.1). Aucune dépendance npm.
//
// SÉCURITÉ : l'IBAN N'EST PAS exporté (écriture comptable de charge = date/fournisseur/
// montants/comptes ; le paiement est hors périmètre). On ne déchiffre donc jamais le Vault
// dans un fichier téléchargeable.
//
// `genererExportCsv` est PUR (testable sans I/O) ; `exporterFacturesValidees` lit les factures
// `validee` d'un cabinet, génère le CSV et bascule leur statut en `exportee` (mode lot, §7.3).

import {
  db,
  facture as factureTable,
  fournisseur as fournisseurTable,
  mappingExport,
} from "@zarya/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

/** Une ligne d'export (déjà résolue : comptes mappés, montants numériques). */
export interface FactureExportRow {
  date_emission: string;
  fournisseur: string;
  numero_facture: string;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  devise: string;
  compte_charge: string;
  compte_fournisseur: string;
  compte_tva: string;
  categorie: string;
}

const EN_TETES = [
  "Date",
  "Fournisseur",
  "NoFacture",
  "HT",
  "TVA",
  "TTC",
  "Devise",
  "CompteCharge",
  "CompteFournisseur",
  "CompteTVA",
  "Categorie",
] as const;

/** Échappe un champ CSV (RFC 4180) : guillemets si séparateur / `"` / saut de ligne. */
function champ(v: string, sep: string): string {
  if (v.includes(sep) || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Génère le CSV (PUR). `separateur` défaut `;`. Montants à 2 décimales, point décimal. */
export function genererExportCsv(rows: FactureExportRow[], separateur = ";"): string {
  const ligne = (cells: string[]) => cells.map((c) => champ(c, separateur)).join(separateur);
  const lignes = [ligne([...EN_TETES])];
  for (const r of rows) {
    lignes.push(
      ligne([
        r.date_emission,
        r.fournisseur,
        r.numero_facture,
        r.total_ht.toFixed(2),
        r.total_tva.toFixed(2),
        r.total_ttc.toFixed(2),
        r.devise,
        r.compte_charge,
        r.compte_fournisseur,
        r.compte_tva,
        r.categorie,
      ]),
    );
  }
  return `${lignes.join("\r\n")}\r\n`;
}

export interface ExportResult {
  csv: string;
  count: number;
  facture_ids: string[];
}

/**
 * Exporte les factures `validee` (non encore exportées) d'un cabinet : génère le CSV puis
 * bascule leur statut en `exportee` (mode lot). Scopé cabinet (anti-fuite). Retourne le CSV +
 * le nombre + les ids. Si aucune facture, renvoie un CSV à en-têtes seules (count 0).
 */
export async function exporterFacturesValidees(cabinet_id: string): Promise<ExportResult> {
  // Mapping cabinet (1re ligne active ; client-global en priorité). Défauts sinon.
  const [map] = await db
    .select({
      compte_fournisseur_defaut: mappingExport.compte_fournisseur_defaut,
      mappings_tva: mappingExport.mappings_tva,
      separateur_csv: mappingExport.separateur_csv,
    })
    .from(mappingExport)
    .where(and(eq(mappingExport.cabinet_id, cabinet_id), eq(mappingExport.actif, true)))
    .limit(1);

  const compteFournisseurDefaut = map?.compte_fournisseur_defaut ?? "2000";
  const mappingsTva = (map?.mappings_tva ?? {}) as Record<string, string>;
  const separateur = map?.separateur_csv ?? ";";

  const rows = await db
    .select({
      id: factureTable.id,
      date_emission: factureTable.date_emission,
      numero_facture: factureTable.numero_facture,
      total_ht: factureTable.total_ht,
      total_tva: factureTable.total_tva,
      total_ttc: factureTable.total_ttc,
      taux_tva_principal: factureTable.taux_tva_principal,
      devise: factureTable.devise,
      compte_charge: factureTable.compte_charge,
      categorie: factureTable.categorie,
      fournisseur_nom: fournisseurTable.raison_sociale,
    })
    .from(factureTable)
    .leftJoin(fournisseurTable, eq(factureTable.fournisseur_id, fournisseurTable.id))
    .where(
      and(
        eq(factureTable.cabinet_id, cabinet_id),
        eq(factureTable.statut, "validee"),
        isNull(factureTable.archived_at),
      ),
    );

  const exportRows: FactureExportRow[] = rows.map((r) => ({
    date_emission: r.date_emission,
    fournisseur: r.fournisseur_nom ?? "",
    numero_facture: r.numero_facture,
    total_ht: Number(r.total_ht),
    total_tva: Number(r.total_tva),
    total_ttc: Number(r.total_ttc),
    devise: r.devise,
    compte_charge: r.compte_charge,
    compte_fournisseur: compteFournisseurDefaut,
    compte_tva: r.taux_tva_principal ? (mappingsTva[r.taux_tva_principal] ?? "") : "",
    categorie: r.categorie ?? "",
  }));

  const csv = genererExportCsv(exportRows, separateur);
  const ids = rows.map((r) => r.id);

  if (ids.length > 0) {
    // Bascule lot validee → exportee (scopé cabinet, anti-fuite).
    await db
      .update(factureTable)
      .set({ statut: "exportee", updated_at: new Date() })
      .where(
        and(
          eq(factureTable.cabinet_id, cabinet_id),
          eq(factureTable.statut, "validee"),
          isNull(factureTable.archived_at),
          inArray(factureTable.id, ids),
        ),
      );
  }

  return { csv, count: ids.length, facture_ids: ids };
}
