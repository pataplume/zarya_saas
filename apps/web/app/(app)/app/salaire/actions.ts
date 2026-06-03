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
import { confirmerImportExport, genererPeriodesMensuelles } from "@zarya/extraction";
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
