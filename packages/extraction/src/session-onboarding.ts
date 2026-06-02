// F6d — Cycle de vie de la session d'onboarding + garde « onboarding bloquant ».
//
// Principe directeur (onboarding-client.md §2) : l'onboarding est BLOQUANT STRICT — aucun
// workflow salaire (création de période, export) tant que la session n'est pas `terminee`.
// La session est `terminee` quand il ne reste AUCUNE proposition d'employé `en_attente` et
// qu'au moins un employé a été validé. Réf : onboarding-client.md §2/§8 ; salaire-schema.md.

import { and, db, eq, propositionEmploye, sessionOnboarding, sql } from "@zarya/db";
import { count } from "drizzle-orm";

export type StatutSessionOnboarding =
  | "initialisee"
  | "etape_1_en_cours"
  | "etape_2_en_cours"
  | "etape_3_en_cours"
  | "terminee"
  | "abandonnee";

/** PUR : une session est-elle considérée terminée ? */
export function onboardingEstTermine(statut: StatutSessionOnboarding): boolean {
  return statut === "terminee";
}

export class OnboardingNonTermineError extends Error {
  constructor(public readonly client_id: string) {
    super(`Onboarding non terminé pour le client ${client_id} : workflow salaire bloqué.`);
    this.name = "OnboardingNonTermineError";
  }
}

export interface CompletudeOnboarding {
  session_id: string;
  statut: StatutSessionOnboarding;
  propositions_en_attente: number;
  nb_employes_valides: number;
  /** Terminable = aucune proposition en attente ET ≥ 1 employé validé. */
  terminable: boolean;
}

/** Évalue la complétude d'une session (scopée cabinet). Retourne null si introuvable. */
export async function evaluerCompletude(
  cabinet_id: string,
  session_id: string,
): Promise<CompletudeOnboarding | null> {
  const [sess] = await db
    .select({
      id: sessionOnboarding.id,
      statut: sessionOnboarding.statut,
      nb_employes_valides: sessionOnboarding.nb_employes_valides,
    })
    .from(sessionOnboarding)
    .where(and(eq(sessionOnboarding.id, session_id), eq(sessionOnboarding.cabinet_id, cabinet_id)))
    .limit(1);
  if (!sess) return null;

  const [enAttente] = await db
    .select({ n: count() })
    .from(propositionEmploye)
    .where(
      and(
        eq(propositionEmploye.session_id, session_id),
        eq(propositionEmploye.statut, "en_attente"),
      ),
    );
  const propositions_en_attente = enAttente?.n ?? 0;

  return {
    session_id: sess.id,
    statut: sess.statut as StatutSessionOnboarding,
    propositions_en_attente,
    nb_employes_valides: sess.nb_employes_valides,
    terminable: propositions_en_attente === 0 && sess.nb_employes_valides >= 1,
  };
}

/**
 * Garde « onboarding bloquant » : lève OnboardingNonTermineError si la session du client n'est
 * pas `terminee`. À appeler avant tout workflow salaire (Bloc G : création de période, export).
 */
export async function assertOnboardingTermine(
  cabinet_id: string,
  client_id: string,
): Promise<void> {
  const [sess] = await db
    .select({ statut: sessionOnboarding.statut })
    .from(sessionOnboarding)
    .where(
      and(eq(sessionOnboarding.cabinet_id, cabinet_id), eq(sessionOnboarding.client_id, client_id)),
    )
    .limit(1);
  if (!sess || !onboardingEstTermine(sess.statut as StatutSessionOnboarding))
    throw new OnboardingNonTermineError(client_id);
}

export interface TerminerOnboardingResult {
  statut: StatutSessionOnboarding;
}

/**
 * Termine une session (statut → terminee) si elle est terminable. App-code (effets multi-colonnes).
 * Idempotent : une session déjà terminée renvoie son statut sans erreur.
 */
export async function terminerOnboarding(
  cabinet_id: string,
  session_id: string,
): Promise<TerminerOnboardingResult> {
  const completude = await evaluerCompletude(cabinet_id, session_id);
  if (!completude) throw new Error("Session introuvable.");
  if (completude.statut === "terminee") return { statut: "terminee" };
  if (!completude.terminable) {
    throw new Error(
      completude.propositions_en_attente > 0
        ? `Onboarding incomplet : ${completude.propositions_en_attente} proposition(s) en attente de validation.`
        : "Onboarding incomplet : aucun employé validé.",
    );
  }
  const now = new Date();
  await db
    .update(sessionOnboarding)
    .set({
      statut: "terminee",
      etape_3b_terminee_at: now,
      date_fin: now,
      date_derniere_activite: now,
      updated_at: now,
    })
    .where(eq(sessionOnboarding.id, session_id));
  return { statut: "terminee" };
}

// ─── F7 — Progression, relance, édition partagée ─────────────────────────────

export interface ProgressionOnboarding {
  session_id: string;
  client_id: string;
  raison_sociale: string;
  statut: StatutSessionOnboarding;
  progression_pct: number;
  nb_employes_attendus: number | null;
  nb_employes_proposes: number;
  nb_employes_valides: number;
  employes_progression_pct: number;
  dernier_acteur_type: "client" | "fiduciaire" | null;
}

/** Lit la progression d'un onboarding (vue v_session_onboarding_progress), scopée cabinet. */
export async function getProgressionOnboarding(
  cabinet_id: string,
  client_id: string,
): Promise<ProgressionOnboarding | null> {
  const rows = (await db.execute(sql`
    SELECT id, client_id, raison_sociale, statut, progression_pct, nb_employes_attendus,
           nb_employes_proposes, nb_employes_valides, employes_progression_pct, dernier_acteur_type
    FROM salaire.v_session_onboarding_progress
    WHERE cabinet_id = ${cabinet_id} AND client_id = ${client_id}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    session_id: r.id as string,
    client_id: r.client_id as string,
    raison_sociale: r.raison_sociale as string,
    statut: r.statut as StatutSessionOnboarding,
    progression_pct: Number(r.progression_pct),
    nb_employes_attendus: r.nb_employes_attendus === null ? null : Number(r.nb_employes_attendus),
    nb_employes_proposes: Number(r.nb_employes_proposes),
    nb_employes_valides: Number(r.nb_employes_valides),
    employes_progression_pct: Number(r.employes_progression_pct),
    dernier_acteur_type: (r.dernier_acteur_type as "client" | "fiduciaire" | null) ?? null,
  };
}

export interface SessionARelancer {
  session_id: string;
  client_id: string;
  raison_sociale: string;
  jours_inactivite: number;
}

/** Liste les sessions inactives ≥ 7 j d'un cabinet (vue v_extractions_a_relancer). */
export async function listerSessionsARelancer(cabinet_id: string): Promise<SessionARelancer[]> {
  const rows = (await db.execute(sql`
    SELECT id, client_id, raison_sociale, jours_inactivite
    FROM salaire.v_extractions_a_relancer
    WHERE cabinet_id = ${cabinet_id}
    ORDER BY jours_inactivite DESC
  `)) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    session_id: r.id as string,
    client_id: r.client_id as string,
    raison_sociale: r.raison_sociale as string,
    jours_inactivite: Number(r.jours_inactivite),
  }));
}

/**
 * Édition partagée (last-write-wins, onboarding-client.md §9) : enregistre qui a agi en dernier
 * + rafraîchit l'horodatage d'activité (réinitialise le compteur de relance). Scopé cabinet.
 */
export async function enregistrerActiviteOnboarding(
  cabinet_id: string,
  session_id: string,
  acteur_type: "client" | "fiduciaire",
  acteur_id?: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(sessionOnboarding)
    .set({
      dernier_acteur_type: acteur_type,
      ...(acteur_id ? { dernier_acteur_id: acteur_id } : {}),
      date_derniere_activite: now,
      updated_at: now,
    })
    .where(and(eq(sessionOnboarding.id, session_id), eq(sessionOnboarding.cabinet_id, cabinet_id)));
}
