// G7a — Cycle de vie du référentiel employé EN COURS D'ANNÉE (vagues d'embauches, sorties,
// modifications, archivage). Réf : salaire.md §20 (réutilisation écrans onboarding hors contexte
// bloquant) ; KICKOFF G7. Statuts : propose → actif → sorti → archive. Toute entrée/sortie/modif
// est journalisée dans salaire.changement (lié à la période courante) + un événement.
//
// Arbitrages founder : (1) entrée vague = réutilise le pipeline F6 proposition→validation
// (finaliserPropositionEmploye), pas de session « terminee » exigée ; (2) archivage = action
// manuelle explicite (sorti → archive), pas d'auto-archivage. Scopé cabinet partout.

import {
  and,
  changement as changementTable,
  db,
  employe as employeTable,
  eq,
  evenementSalaire,
  periode as periodeTable,
} from "@zarya/db";
import { finaliserPropositionEmploye } from "./finalize-employe";

/** Charge un employé scopé cabinet (id, client_id, statut, valeurs courantes). */
async function chargerEmploye(cabinet_id: string, employe_id: string) {
  const [e] = await db
    .select({
      id: employeTable.id,
      client_id: employeTable.client_id,
      statut: employeTable.statut,
      salaire_base_mensuel: employeTable.salaire_base_mensuel,
      taux_activite: employeTable.taux_activite,
    })
    .from(employeTable)
    .where(and(eq(employeTable.id, employe_id), eq(employeTable.cabinet_id, cabinet_id)))
    .limit(1);
  return e ?? null;
}

/** Vérifie que la période appartient bien au couple (cabinet, client). Renvoie true/false. */
async function periodeAppartient(
  cabinet_id: string,
  client_id: string,
  periode_id: string,
): Promise<boolean> {
  const [p] = await db
    .select({ id: periodeTable.id })
    .from(periodeTable)
    .where(
      and(
        eq(periodeTable.id, periode_id),
        eq(periodeTable.cabinet_id, cabinet_id),
        eq(periodeTable.client_id, client_id),
      ),
    )
    .limit(1);
  return Boolean(p);
}

export interface EntreeReferentielInput {
  cabinet_id: string;
  proposition_employe_id: string;
  periode_id: string;
  date_entree: string; // ISO date (YYYY-MM-DD)
  acteur_id: string;
}

export interface LifecycleResult {
  employe_id: string;
  changement_id: string;
}

/**
 * Entrée (embauche en cours d'année) : finalise une proposition validée via le pipeline F6
 * (employé créé `actif`), pose date_entree, journalise un changement `entree` sur la période
 * courante + événement `employe_confirme`. Réutilise le contrôle Swissdec/Vault de F6.
 */
export async function enregistrerEntreeReferentiel(
  input: EntreeReferentielInput,
): Promise<LifecycleResult> {
  const { employe_id } = await finaliserPropositionEmploye({
    cabinet_id: input.cabinet_id,
    proposition_employe_id: input.proposition_employe_id,
    valide_par_type: "fiduciaire",
    valide_par_id: input.acteur_id,
  });

  const emp = await chargerEmploye(input.cabinet_id, employe_id);
  if (!emp) throw new Error("Employé introuvable après finalisation.");
  if (!(await periodeAppartient(input.cabinet_id, emp.client_id, input.periode_id)))
    throw new Error("Période incohérente avec le client de l'employé.");

  const now = new Date();
  await db
    .update(employeTable)
    .set({ date_entree: input.date_entree, updated_at: now })
    .where(eq(employeTable.id, employe_id));

  const [ch] = await db
    .insert(changementTable)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: emp.client_id,
      periode_id: input.periode_id,
      employe_id,
      type: "entree",
      date_effet: input.date_entree,
      source: "fiduciaire_saisie",
      valide_par_fiduciaire: true,
      applique_dans_referentiel: true,
    })
    .returning({ id: changementTable.id });
  if (!ch) throw new Error("Échec de l'enregistrement du changement d'entrée.");

  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: emp.client_id,
    periode_id: input.periode_id,
    type: "employe_confirme",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.acteur_id,
    metadata: { employe_id, motif: "entree_vague" },
  });

  return { employe_id, changement_id: ch.id };
}

export interface SortieEmployeInput {
  cabinet_id: string;
  employe_id: string;
  periode_id: string;
  date_sortie: string; // ISO date
  motif?: string;
  acteur_id: string;
}

/**
 * Sortie : un employé `actif` passe `sorti` (date_sortie posée), journalise un changement
 * `sortie` + événement `employe_sorti`. Idempotent : refuse si déjà sorti/archivé.
 */
export async function sortirEmploye(input: SortieEmployeInput): Promise<LifecycleResult> {
  const emp = await chargerEmploye(input.cabinet_id, input.employe_id);
  if (!emp) throw new Error("Employé introuvable.");
  if (emp.statut !== "actif") throw new Error("Seul un employé actif peut être sorti.");
  if (!(await periodeAppartient(input.cabinet_id, emp.client_id, input.periode_id)))
    throw new Error("Période incohérente avec le client de l'employé.");

  const now = new Date();
  await db
    .update(employeTable)
    .set({ statut: "sorti", date_sortie: input.date_sortie, updated_at: now })
    .where(eq(employeTable.id, input.employe_id));

  const [ch] = await db
    .insert(changementTable)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: emp.client_id,
      periode_id: input.periode_id,
      employe_id: input.employe_id,
      type: "sortie",
      date_effet: input.date_sortie,
      ...(input.motif ? { description: input.motif } : {}),
      source: "fiduciaire_saisie",
      valide_par_fiduciaire: true,
      applique_dans_referentiel: true,
    })
    .returning({ id: changementTable.id });
  if (!ch) throw new Error("Échec de l'enregistrement du changement de sortie.");

  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: emp.client_id,
    periode_id: input.periode_id,
    type: "employe_sorti",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.acteur_id,
    metadata: { employe_id: input.employe_id },
  });

  return { employe_id: input.employe_id, changement_id: ch.id };
}

export type TypeModificationReferentiel = "changement_salaire" | "changement_taux";

export interface ModificationReferentielInput {
  cabinet_id: string;
  employe_id: string;
  periode_id: string;
  type: TypeModificationReferentiel;
  date_effet: string; // ISO date
  nouveau_salaire_base?: number; // requis si type=changement_salaire
  nouveau_taux_activite?: number; // requis si type=changement_taux
  acteur_id: string;
}

/**
 * Modification du référentiel d'un employé `actif` (salaire ou taux d'activité) : met à jour la
 * valeur, journalise un changement typé avec ancien/nouveau + événement
 * `changement_applique_referentiel`. L'employé reste `actif`.
 */
export async function appliquerModificationReferentiel(
  input: ModificationReferentielInput,
): Promise<LifecycleResult> {
  const emp = await chargerEmploye(input.cabinet_id, input.employe_id);
  if (!emp) throw new Error("Employé introuvable.");
  if (emp.statut !== "actif") throw new Error("Seul un employé actif peut être modifié.");
  if (!(await periodeAppartient(input.cabinet_id, emp.client_id, input.periode_id)))
    throw new Error("Période incohérente avec le client de l'employé.");

  const estSalaire = input.type === "changement_salaire";
  if (estSalaire && input.nouveau_salaire_base === undefined)
    throw new Error("Nouveau salaire de base requis.");
  if (!estSalaire && input.nouveau_taux_activite === undefined)
    throw new Error("Nouveau taux d'activité requis.");

  const now = new Date();
  if (estSalaire) {
    await db
      .update(employeTable)
      .set({ salaire_base_mensuel: String(input.nouveau_salaire_base), updated_at: now })
      .where(eq(employeTable.id, input.employe_id));
  } else {
    await db
      .update(employeTable)
      .set({ taux_activite: String(input.nouveau_taux_activite), updated_at: now })
      .where(eq(employeTable.id, input.employe_id));
  }

  const [ch] = await db
    .insert(changementTable)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: emp.client_id,
      periode_id: input.periode_id,
      employe_id: input.employe_id,
      type: input.type,
      date_effet: input.date_effet,
      source: "fiduciaire_saisie",
      valide_par_fiduciaire: true,
      applique_dans_referentiel: true,
      ...(estSalaire
        ? {
            ancien_salaire_base: emp.salaire_base_mensuel ?? null,
            nouveau_salaire_base: String(input.nouveau_salaire_base),
          }
        : {
            ancien_taux_activite: emp.taux_activite ?? null,
            nouveau_taux_activite: String(input.nouveau_taux_activite),
          }),
    })
    .returning({ id: changementTable.id });
  if (!ch) throw new Error("Échec de l'enregistrement de la modification.");

  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: emp.client_id,
    periode_id: input.periode_id,
    type: "changement_applique_referentiel",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.acteur_id,
    metadata: { employe_id: input.employe_id, type: input.type },
  });

  return { employe_id: input.employe_id, changement_id: ch.id };
}

export interface ArchiverEmployeInput {
  cabinet_id: string;
  employe_id: string;
  acteur_id: string;
}

/**
 * Archivage (manuel) : un employé `sorti` passe `archive` (archived_at posé). Terminal.
 * Pas de changement de paie (acte administratif) ; événement `statut_modifie`. Idempotent.
 */
export async function archiverEmploye(
  input: ArchiverEmployeInput,
): Promise<{ employe_id: string }> {
  const emp = await chargerEmploye(input.cabinet_id, input.employe_id);
  if (!emp) throw new Error("Employé introuvable.");
  if (emp.statut !== "sorti") throw new Error("Seul un employé sorti peut être archivé.");

  const now = new Date();
  await db
    .update(employeTable)
    .set({ statut: "archive", archived_at: now, updated_at: now })
    .where(eq(employeTable.id, input.employe_id));

  await db.insert(evenementSalaire).values({
    cabinet_id: input.cabinet_id,
    client_id: emp.client_id,
    type: "statut_modifie",
    acteur_type: "humain_fiduciaire",
    acteur_id: input.acteur_id,
    metadata: { employe_id: input.employe_id, statut: "archive" },
  });

  return { employe_id: input.employe_id };
}
