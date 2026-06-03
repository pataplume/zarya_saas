"use server";

import { requireAuth } from "@zarya/auth";
import {
  and,
  db,
  elementPaie,
  eq,
  evenementSalaire,
  periode as periodeTable,
  sql,
  validationPeriode,
} from "@zarya/db";
import {
  appliquerModificationReferentiel,
  archiverEmploye,
  confirmerImportExport,
  enregistrerEntreeReferentiel,
  genererPeriodesMensuelles,
  sortirEmploye,
} from "@zarya/extraction";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// G4b — Dashboard fiduciaire : édition « à la place du client », revue, lancement campagne.
// requireAuth + RBAC ROLES_ECRITURE + scope cabinet. Édition partagée last-write-wins ;
// audit diff avant/après via salaire.evenement. Réf : salaire.md §6/§8 ; flow E §5-6 ; KICKOFF G4.

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);
// G6b : `exportee` reste éditable (fenêtre de correction post-export, ré-export possible).
// Seul `cloturee` verrouille en dur (arbitré founder).
const STATUTS_EDITABLES = new Set([
  "non_demandee",
  "en_attente",
  "relancee",
  "en_retard",
  "validee",
  "exportee",
]);

export type SalaireFiduciaireState = {
  error?: string;
  success?: boolean;
  crees?: number;
};

async function ctx(): Promise<{ cabinet_id: string; user_id: string } | { error: string }> {
  const user = await requireAuth();
  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return { error: "Cabinet introuvable." };
  const role = user.app_metadata.role as string | undefined;
  if (!role || !ROLES_ECRITURE.has(role)) return { error: "Droits insuffisants." };
  return { cabinet_id, user_id: user.id };
}

const SaisieSchema = z.object({
  periode_id: z.string().uuid(),
  employe_id: z.string().uuid(),
  type_element_id: z.string().uuid(),
  valeur_numerique: z.coerce.number().finite(),
});

/** Saisie d'un élément « à la place du client » (source fiduciaire_saisie + audit diff). */
export async function saisirElementFiduciaireAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;

  const parsed = SaisieSchema.safeParse({
    periode_id: formData.get("periode_id"),
    employe_id: formData.get("employe_id"),
    type_element_id: formData.get("type_element_id"),
    valeur_numerique: formData.get("valeur_numerique"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const v = parsed.data;

  const [p] = await db
    .select({ statut: periodeTable.statut, client_id: periodeTable.client_id })
    .from(periodeTable)
    .where(and(eq(periodeTable.id, v.periode_id), eq(periodeTable.cabinet_id, c.cabinet_id)))
    .limit(1);
  if (!p) return { error: "Période introuvable." };
  if (!STATUTS_EDITABLES.has(p.statut))
    return { error: "Période verrouillée (exportée/clôturée)." };

  // Valeur avant (audit diff).
  const [avant] = await db
    .select({ valeur: elementPaie.valeur_numerique })
    .from(elementPaie)
    .where(
      and(
        eq(elementPaie.periode_id, v.periode_id),
        eq(elementPaie.employe_id, v.employe_id),
        eq(elementPaie.type_element_id, v.type_element_id),
      ),
    )
    .limit(1);

  await db
    .insert(elementPaie)
    .values({
      cabinet_id: c.cabinet_id,
      client_id: p.client_id,
      periode_id: v.periode_id,
      employe_id: v.employe_id,
      type_element_id: v.type_element_id,
      valeur_numerique: v.valeur_numerique.toString(),
      source: "fiduciaire_saisie",
      modifie_par_acteur_type: "fiduciaire",
      modifie_par_acteur_id: c.user_id,
    })
    .onConflictDoUpdate({
      target: [elementPaie.periode_id, elementPaie.employe_id, elementPaie.type_element_id],
      set: {
        valeur_numerique: v.valeur_numerique.toString(),
        source: "fiduciaire_saisie",
        modifie_par_acteur_type: "fiduciaire",
        modifie_par_acteur_id: c.user_id,
        updated_at: new Date(),
      },
    });

  await db
    .update(periodeTable)
    .set({
      derniere_modification_par: "fiduciaire",
      derniere_modification_acteur_id: c.user_id,
      derniere_modification_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(periodeTable.id, v.periode_id));

  // Audit diff avant/après (salaire.evenement).
  await db.insert(evenementSalaire).values({
    cabinet_id: c.cabinet_id,
    client_id: p.client_id,
    periode_id: v.periode_id,
    type: "element_paie_modifie",
    acteur_type: "humain_fiduciaire",
    acteur_id: c.user_id,
    metadata: {
      employe_id: v.employe_id,
      type_element_id: v.type_element_id,
      avant: avant?.valeur ?? null,
      apres: v.valeur_numerique,
    },
  });

  revalidatePath("/app/salaire");
  return { success: true };
}

const RevueSchema = z.object({ periode_id: z.string().uuid() });

/** Revue fiduciaire d'une période (« validee_cabinet ») : pose le jalon revue_fiduciaire_at. */
export async function revoirPeriodeAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const parsed = RevueSchema.safeParse({ periode_id: formData.get("periode_id") });
  if (!parsed.success) return { error: "Période invalide." };
  const periode_id = parsed.data.periode_id;

  const [p] = await db
    .select({ statut: periodeTable.statut, client_id: periodeTable.client_id })
    .from(periodeTable)
    .where(and(eq(periodeTable.id, periode_id), eq(periodeTable.cabinet_id, c.cabinet_id)))
    .limit(1);
  if (!p) return { error: "Période introuvable." };
  if (p.statut === "exportee" || p.statut === "cloturee")
    return { error: "Période déjà exportée ou clôturée." };

  // Si aucune validation n'existe encore, le fiduciaire valide pour le client.
  const [val] = await db
    .select({ id: validationPeriode.id })
    .from(validationPeriode)
    .where(eq(validationPeriode.periode_id, periode_id))
    .limit(1);
  if (!val) {
    await db.insert(validationPeriode).values({
      cabinet_id: c.cabinet_id,
      client_id: p.client_id,
      periode_id,
      valide_par_type: "fiduciaire_pour_client",
      methode: "confirmation_manuelle",
    });
  }

  const now = new Date();
  await db
    .update(periodeTable)
    .set({
      statut: "validee",
      revue_fiduciaire_at: now,
      revue_fiduciaire_par: c.user_id,
      ...(p.statut !== "validee" ? { date_validation_recue: now } : {}),
      updated_at: now,
    })
    .where(eq(periodeTable.id, periode_id));

  await db.insert(evenementSalaire).values({
    cabinet_id: c.cabinet_id,
    client_id: p.client_id,
    periode_id,
    type: "validation_par_fiduciaire",
    acteur_type: "humain_fiduciaire",
    acteur_id: c.user_id,
  });

  revalidatePath("/app/salaire");
  return { success: true };
}

const ImportSchema = z.object({
  export_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

/**
 * G6b — « Marquer importé » : confirme l'import de l'export dans le logiciel de paie, ce qui
 * AUTO-clôture la période (exportee → cloturee). Scopé cabinet + RBAC écriture.
 */
export async function confirmerImportAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const notesRaw = formData.get("notes");
  const parsed = ImportSchema.safeParse({
    export_id: formData.get("export_id"),
    ...(typeof notesRaw === "string" && notesRaw.length > 0 ? { notes: notesRaw } : {}),
  });
  if (!parsed.success) return { error: "Export invalide." };

  try {
    await confirmerImportExport({
      cabinet_id: c.cabinet_id,
      export_id: parsed.data.export_id,
      import_par: c.user_id,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la confirmation d'import." };
  }

  revalidatePath("/app/salaire");
  return { success: true };
}

// ─── G7a — Cycle de vie du référentiel employé (vagues) ───────────────────────
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue (AAAA-MM-JJ).");

const EntreeSchema = z.object({
  proposition_employe_id: z.string().uuid(),
  periode_id: z.string().uuid(),
  date_entree: ISO_DATE,
});

/** Entrée (embauche en cours d'année) : finalise une proposition validée + journalise l'entrée. */
export async function enregistrerEntreeAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const parsed = EntreeSchema.safeParse({
    proposition_employe_id: formData.get("proposition_employe_id"),
    periode_id: formData.get("periode_id"),
    date_entree: formData.get("date_entree"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Entrée invalide." };
  try {
    await enregistrerEntreeReferentiel({
      cabinet_id: c.cabinet_id,
      acteur_id: c.user_id,
      ...parsed.data,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'entrée." };
  }
  revalidatePath("/app/salaire");
  return { success: true };
}

const SortieSchema = z.object({
  employe_id: z.string().uuid(),
  periode_id: z.string().uuid(),
  date_sortie: ISO_DATE,
  motif: z.string().max(500).optional(),
});

/** Sortie d'un employé actif (statut sorti + changement sortie). */
export async function sortirEmployeAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const motifRaw = formData.get("motif");
  const parsed = SortieSchema.safeParse({
    employe_id: formData.get("employe_id"),
    periode_id: formData.get("periode_id"),
    date_sortie: formData.get("date_sortie"),
    ...(typeof motifRaw === "string" && motifRaw.length > 0 ? { motif: motifRaw } : {}),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Sortie invalide." };
  const v = parsed.data;
  try {
    await sortirEmploye({
      cabinet_id: c.cabinet_id,
      acteur_id: c.user_id,
      employe_id: v.employe_id,
      periode_id: v.periode_id,
      date_sortie: v.date_sortie,
      ...(v.motif !== undefined ? { motif: v.motif } : {}),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la sortie." };
  }
  revalidatePath("/app/salaire");
  return { success: true };
}

const ModificationSchema = z
  .object({
    employe_id: z.string().uuid(),
    periode_id: z.string().uuid(),
    type: z.enum(["changement_salaire", "changement_taux"]),
    date_effet: ISO_DATE,
    nouveau_salaire_base: z.coerce.number().positive().optional(),
    nouveau_taux_activite: z.coerce.number().positive().max(100).optional(),
  })
  .refine(
    (v) =>
      v.type === "changement_salaire"
        ? v.nouveau_salaire_base !== undefined
        : v.nouveau_taux_activite !== undefined,
    { message: "Nouvelle valeur requise pour ce type de modification." },
  );

/** Modification du référentiel (salaire ou taux) d'un employé actif. */
export async function modifierReferentielAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const salaireRaw = formData.get("nouveau_salaire_base");
  const tauxRaw = formData.get("nouveau_taux_activite");
  const parsed = ModificationSchema.safeParse({
    employe_id: formData.get("employe_id"),
    periode_id: formData.get("periode_id"),
    type: formData.get("type"),
    date_effet: formData.get("date_effet"),
    ...(typeof salaireRaw === "string" && salaireRaw.length > 0
      ? { nouveau_salaire_base: salaireRaw }
      : {}),
    ...(typeof tauxRaw === "string" && tauxRaw.length > 0
      ? { nouveau_taux_activite: tauxRaw }
      : {}),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Modification invalide." };
  const v = parsed.data;
  try {
    await appliquerModificationReferentiel({
      cabinet_id: c.cabinet_id,
      acteur_id: c.user_id,
      employe_id: v.employe_id,
      periode_id: v.periode_id,
      type: v.type,
      date_effet: v.date_effet,
      ...(v.nouveau_salaire_base !== undefined
        ? { nouveau_salaire_base: v.nouveau_salaire_base }
        : {}),
      ...(v.nouveau_taux_activite !== undefined
        ? { nouveau_taux_activite: v.nouveau_taux_activite }
        : {}),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de la modification." };
  }
  revalidatePath("/app/salaire");
  return { success: true };
}

const ArchiveSchema = z.object({ employe_id: z.string().uuid() });

/** Archivage manuel d'un employé sorti (sorti → archive, terminal). */
export async function archiverEmployeAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const parsed = ArchiveSchema.safeParse({ employe_id: formData.get("employe_id") });
  if (!parsed.success) return { error: "Employé invalide." };
  try {
    await archiverEmploye({
      cabinet_id: c.cabinet_id,
      employe_id: parsed.data.employe_id,
      acteur_id: c.user_id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Échec de l'archivage." };
  }
  revalidatePath("/app/salaire");
  return { success: true };
}

const CampagneSchema = z.object({
  annee: z.coerce.number().int().min(2020).max(2100),
  mois: z.coerce.number().int().min(1).max(12),
});

/** Lance la campagne mensuelle : génère les périodes du mois pour les clients du cabinet. */
export async function lancerCampagneAction(
  _prev: SalaireFiduciaireState,
  formData: FormData,
): Promise<SalaireFiduciaireState> {
  const c = await ctx();
  if ("error" in c) return c;
  const parsed = CampagneSchema.safeParse({
    annee: formData.get("annee"),
    mois: formData.get("mois"),
  });
  if (!parsed.success) return { error: "Mois invalide." };

  const res = await genererPeriodesMensuelles({
    annee: parsed.data.annee,
    mois: parsed.data.mois,
    cabinet_id: c.cabinet_id,
  });
  revalidatePath("/app/salaire");
  return { success: true, crees: res.crees };
}
