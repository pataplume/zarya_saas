// G2 — Génération mensuelle des périodes de paie + prépopulation (flow E §1-2).
//
// App-code (arbitré founder) : invoqué par un cron Vercel. Pour chaque client éligible
// (service `salaires` actif + crm.salaire_config + onboarding `terminee`), crée la période du
// mois, la pré-remplit depuis M-1 (éléments RÉCURRENTS + report des changements non absorbés),
// et crée l'échéance crm.echeance liée. Idempotent (uniq_periode_client_mois). BLOQUANT : aucune
// période si l'onboarding n'est pas terminé (garde onboardingEstTermine, F6d).
//
// Réf : docs/modules/salaire.md §5 ; docs/data-model/salaire-schema.md §4-6 ; KICKOFF G2 ; ADR 0021.

import {
  and,
  changement as changementTable,
  db,
  echeance as echeanceTable,
  elementPaie,
  eq,
  evenementSalaire,
  periode as periodeTable,
  sql,
  typeElementPaie,
} from "@zarya/db";

/** Mois précédent (gère le passage d'année). PUR. */
export function moisPrecedent(annee: number, mois: number): { annee: number; mois: number } {
  return mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 };
}

/** Nombre de jours d'un mois (gère les années bissextiles). PUR. */
export function joursDansMois(annee: number, mois: number): number {
  return [
    31,
    (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][mois - 1] as number;
}

/**
 * Date limite de validation = `jour`-ième du mois (clampé à la longueur du mois). PUR.
 * Retourne 'YYYY-MM-DD'. `jour` null/invalide → dernier jour du mois.
 */
export function deriverDateLimite(
  annee: number,
  mois: number,
  jour: number | null | undefined,
): string {
  const max = joursDansMois(annee, mois);
  const j = jour && jour >= 1 ? Math.min(jour, max) : max;
  return `${annee}-${String(mois).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

export interface GenererPeriodesInput {
  annee: number;
  mois: number;
  /** Restreint à un cabinet (optionnel ; sinon tous). */
  cabinet_id?: string;
}

export interface GenererPeriodesResult {
  crees: number;
  prepopulees: number;
  ignores_onboarding: number;
  ignores_existant: number;
}

interface ClientEligible {
  client_id: string;
  cabinet_id: string;
  jour_validation: number | null;
  onboarding_statut: string | null;
}

/**
 * Génère les périodes du mois (annee, mois) pour tous les clients éligibles. App-code, idempotent.
 */
export async function genererPeriodesMensuelles(
  input: GenererPeriodesInput,
): Promise<GenererPeriodesResult> {
  const { annee, mois } = input;
  const prec = moisPrecedent(annee, mois);
  const result: GenererPeriodesResult = {
    crees: 0,
    prepopulees: 0,
    ignores_onboarding: 0,
    ignores_existant: 0,
  };

  // Clients avec service salaires actif + config paie ; statut d'onboarding joint.
  const rows = (await db.execute(sql`
    SELECT sc.client_id, sc.cabinet_id, sc.date_validation_jour_du_mois AS jour_validation,
           so.statut AS onboarding_statut
    FROM crm.salaire_config sc
    JOIN crm.service svc
      ON svc.client_id = sc.client_id AND svc.type = 'salaires' AND svc.actif = true
    LEFT JOIN salaire.session_onboarding so ON so.client_id = sc.client_id
    WHERE ${input.cabinet_id ? sql`sc.cabinet_id = ${input.cabinet_id}` : sql`true`}
  `)) as unknown as ClientEligible[];

  for (const r of rows) {
    // BLOQUANT : onboarding non terminé → on ne crée pas de période.
    if (r.onboarding_statut !== "terminee") {
      result.ignores_onboarding++;
      continue;
    }

    // Idempotence : période déjà existante pour (client, annee, mois) ?
    const [existante] = await db
      .select({ id: periodeTable.id })
      .from(periodeTable)
      .where(
        and(
          eq(periodeTable.client_id, r.client_id),
          eq(periodeTable.annee, annee),
          eq(periodeTable.mois, mois),
        ),
      )
      .limit(1);
    if (existante) {
      result.ignores_existant++;
      continue;
    }

    // Période M-1 (source de prépopulation).
    const [precedente] = await db
      .select({ id: periodeTable.id })
      .from(periodeTable)
      .where(
        and(
          eq(periodeTable.client_id, r.client_id),
          eq(periodeTable.annee, prec.annee),
          eq(periodeTable.mois, prec.mois),
        ),
      )
      .limit(1);

    const dateLimite = deriverDateLimite(annee, mois, r.jour_validation);

    // Création de la période (statut non_demandee : notification = G5).
    const [nouvelle] = await db
      .insert(periodeTable)
      .values({
        cabinet_id: r.cabinet_id,
        client_id: r.client_id,
        annee,
        mois,
        statut: "non_demandee",
        date_limite_validation: dateLimite,
        ...(precedente ? { pre_remplie_depuis: precedente.id } : {}),
      })
      .returning({ id: periodeTable.id });
    if (!nouvelle) continue;
    result.crees++;

    // Prépopulation depuis M-1 : éléments RÉCURRENTS uniquement (arbitré founder).
    let aPrepopule = false;
    if (precedente) {
      const recurrents = await db
        .select({
          employe_id: elementPaie.employe_id,
          type_element_id: elementPaie.type_element_id,
          valeur_numerique: elementPaie.valeur_numerique,
          valeur_texte: elementPaie.valeur_texte,
          origine: elementPaie.id,
        })
        .from(elementPaie)
        .innerJoin(typeElementPaie, eq(typeElementPaie.id, elementPaie.type_element_id))
        .where(and(eq(elementPaie.periode_id, precedente.id), eq(typeElementPaie.recurrent, true)));

      for (const el of recurrents) {
        await db.insert(elementPaie).values({
          cabinet_id: r.cabinet_id,
          client_id: r.client_id,
          periode_id: nouvelle.id,
          employe_id: el.employe_id,
          type_element_id: el.type_element_id,
          valeur_numerique: el.valeur_numerique,
          valeur_texte: el.valeur_texte,
          source: "pre_remplie",
          origine_element_id: el.origine,
        });
        aPrepopule = true;
      }

      // Report des changements non absorbés (applique_dans_referentiel = false).
      const nonAbsorbes = await db
        .select({
          employe_id: changementTable.employe_id,
          type: changementTable.type,
          date_effet: changementTable.date_effet,
          description: changementTable.description,
        })
        .from(changementTable)
        .where(
          and(
            eq(changementTable.periode_id, precedente.id),
            eq(changementTable.applique_dans_referentiel, false),
          ),
        );
      for (const ch of nonAbsorbes) {
        await db.insert(changementTable).values({
          cabinet_id: r.cabinet_id,
          client_id: r.client_id,
          periode_id: nouvelle.id,
          employe_id: ch.employe_id,
          type: ch.type,
          date_effet: ch.date_effet,
          description: ch.description,
          source: "fiduciaire_saisie",
        });
        aPrepopule = true;
      }
    }

    if (aPrepopule) {
      await db
        .update(periodeTable)
        .set({ pre_remplie: true, updated_at: new Date() })
        .where(eq(periodeTable.id, nouvelle.id));
      result.prepopulees++;
    }

    // Échéance liée (crm.echeance type 'salaire').
    await db.insert(echeanceTable).values({
      cabinet_id: r.cabinet_id,
      client_id: r.client_id,
      type: "salaire",
      libelle: `Valider les salaires ${String(mois).padStart(2, "0")}/${annee}`,
      date_echeance: dateLimite,
    });

    // Journal.
    await db.insert(evenementSalaire).values({
      cabinet_id: r.cabinet_id,
      client_id: r.client_id,
      periode_id: nouvelle.id,
      type: "periode_creee",
      acteur_type: "systeme",
    });
    if (aPrepopule) {
      await db.insert(evenementSalaire).values({
        cabinet_id: r.cabinet_id,
        client_id: r.client_id,
        periode_id: nouvelle.id,
        type: "periode_pre_remplie",
        acteur_type: "systeme",
      });
    }
  }

  return result;
}
