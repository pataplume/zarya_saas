// F6d — Cycle de vie de la session d'onboarding + garde « onboarding bloquant ».
//
// Principe directeur (onboarding-client.md §2) : l'onboarding est BLOQUANT STRICT — aucun
// workflow salaire (création de période, export) tant que la session n'est pas `terminee`.
// La session est `terminee` quand il ne reste AUCUNE proposition d'employé `en_attente` et
// qu'au moins un employé a été validé. Réf : onboarding-client.md §2/§8 ; salaire-schema.md.

import { and, db, eq, propositionEmploye, sessionOnboarding } from "@zarya/db";
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
