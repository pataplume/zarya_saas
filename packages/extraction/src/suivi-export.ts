// G6b — Suivi post-export du cycle salaire. Réf : salaire.md §6.1 (pastille export, action
// « marquer importé ») ; flow E §10-11 ; KICKOFF G6.
//
// Transitions (arbitré founder) :
//   genere → telecharge        (marquerExportTelecharge, best-effort au download)
//   telecharge|genere → importe + import_confirme=true  (confirmerImportExport)
//     ⮑ AUTO : la période passe `exportee` → `cloturee` dans la foulée (état terminal unique).
// Verrouillage : seul `cloturee` verrouille en dur l'édition ; `exportee` laisse une fenêtre de
// correction (cf. STATUTS_EDITABLES fiduciaire). La notification de clôture est DIFFÉRÉE (événement seul).

import { and, db, eq, evenementSalaire, exportSalaire, periode as periodeTable } from "@zarya/db";

export interface MarquerTelechargeInput {
  cabinet_id: string;
  export_id: string;
  acteur_id: string;
}

/**
 * Marque un export comme téléchargé (statut `genere` → `telecharge`). Idempotent : si déjà
 * téléchargé/importé, ne régresse pas le statut. Scopé cabinet. Best-effort (ne lève pas si introuvable).
 */
export async function marquerExportTelecharge(
  input: MarquerTelechargeInput,
): Promise<{ marque: boolean }> {
  const [exp] = await db
    .select({
      id: exportSalaire.id,
      periode_id: exportSalaire.periode_id,
      statut: exportSalaire.statut,
    })
    .from(exportSalaire)
    .where(
      and(eq(exportSalaire.id, input.export_id), eq(exportSalaire.cabinet_id, input.cabinet_id)),
    )
    .limit(1);
  if (!exp || exp.statut !== "genere") return { marque: false };

  const now = new Date();
  await db
    .update(exportSalaire)
    .set({ statut: "telecharge", telecharge_le: now, updated_at: now })
    .where(eq(exportSalaire.id, input.export_id));
  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    periode_id: exp.periode_id,
    type: "export_telecharge",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.acteur_id,
  });
  return { marque: true };
}

export interface ConfirmerImportInput {
  cabinet_id: string;
  export_id: string;
  import_par: string;
  notes?: string;
}

export interface ConfirmerImportResult {
  export_id: string;
  periode_id: string;
  statut_periode: "cloturee";
}

/**
 * Confirme l'import d'un export dans le logiciel de paie : export → `importe` (import_confirme),
 * puis AUTO-clôture de la période (`exportee` → `cloturee` + dates + événements). État terminal.
 * Prérequis : période en `exportee`. Scopé cabinet.
 */
export async function confirmerImportExport(
  input: ConfirmerImportInput,
): Promise<ConfirmerImportResult> {
  const [exp] = await db
    .select({
      id: exportSalaire.id,
      periode_id: exportSalaire.periode_id,
      client_id: exportSalaire.client_id,
    })
    .from(exportSalaire)
    .where(
      and(eq(exportSalaire.id, input.export_id), eq(exportSalaire.cabinet_id, input.cabinet_id)),
    )
    .limit(1);
  if (!exp) throw new Error("Export introuvable.");

  const [p] = await db
    .select({ statut: periodeTable.statut })
    .from(periodeTable)
    .where(eq(periodeTable.id, exp.periode_id))
    .limit(1);
  if (!p) throw new Error("Période introuvable.");
  if (p.statut === "cloturee") throw new Error("Période déjà clôturée.");
  if (p.statut !== "exportee")
    throw new Error("Import confirmable uniquement sur une période exportée.");

  const now = new Date();
  await db
    .update(exportSalaire)
    .set({
      statut: "importe",
      import_confirme: true,
      import_confirme_le: now,
      import_confirme_par: input.import_par,
      ...(input.notes ? { import_notes: input.notes } : {}),
      updated_at: now,
    })
    .where(eq(exportSalaire.id, input.export_id));

  await db
    .update(periodeTable)
    .set({
      statut: "cloturee",
      date_import_confirme: now,
      date_cloture: now,
      updated_at: now,
    })
    .where(eq(periodeTable.id, exp.periode_id));

  await db.insert(evenementSalaire).values([
    {
      cabinet_id: input.cabinet_id,
      client_id: exp.client_id,
      periode_id: exp.periode_id,
      type: "import_confirme",
      acteur_type: "humain_fiduciaire",
      acteur_id: input.import_par,
      ...(input.notes ? { metadata: { notes: input.notes } } : {}),
    },
    {
      cabinet_id: input.cabinet_id,
      client_id: exp.client_id,
      periode_id: exp.periode_id,
      type: "periode_clotturee",
      acteur_type: "humain_fiduciaire",
      acteur_id: input.import_par,
    },
  ]);

  return { export_id: exp.id, periode_id: exp.periode_id, statut_periode: "cloturee" };
}
