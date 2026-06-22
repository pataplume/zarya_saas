// @zarya/calendar — logique de domaine du module Calendar.
// Run 5 : rendu des relances (interpolation Handlebars logic-less). ADR 0011 §2.

// Lot 2 (ADR 0025 / ADR 0011 Run 6) — cœur PUR du calcul de dates d'échéances.
export {
  calculerOccurrences,
  dernierJourDuMois,
  type FrequenceEcheance,
  horizonEnd,
  type Occurrence,
  type TemplateRule,
} from "./echeance/catalogue";
// Lot 2 — génération des échéances d'UN client (à l'activation/maj d'un service).
export {
  type GenererEcheancesOptions,
  type GenererEcheancesResult,
  genererEcheancesPourClient,
} from "./echeance/generer";
// Lot 6 — cron « horizon » : roule l'horizon des échéances pour tous les clients (idempotent).
export {
  type RoulerHorizonOptions,
  type RoulerHorizonResult,
  roulerHorizonEcheances,
} from "./echeance/horizon";
// C4 : maj statuts échéances + recalcul risque (cron).
export {
  type MajEcheancesOptions,
  type MajEcheancesResult,
  majEcheancesEtRisque,
} from "./echeance/maj-echeances";
// Lot 4 (ADR 0025) : création MANUELLE d'un brouillon de relance (bouton « Relancer »).
export {
  type CibleRelance,
  type CreerBrouillonOptions,
  type CreerBrouillonResult,
  type CreerBrouillonStatus,
  creerBrouillonRelance,
} from "./relance/brouillon-manuel";
// C2b : envoi des relances validées (draft+send, tracking message id).
export {
  type EnvoyerLotResult,
  type EnvoyerRelanceOptions,
  type EnvoyerRelanceResult,
  type EnvoyerRelanceStatus,
  envoyerRelance,
  envoyerRelancesValidees,
  PLAFOND_LOT,
} from "./relance/envoyer";
// Lot 6 — escalade des relances (relance n°2/3… après envoi, politique d'arrêt après N).
export {
  DELAI_ENTRE_RELANCES_JOURS_DEFAUT,
  type EscaladeRelancesOptions,
  type EscaladeRelancesResult,
  escaladerRelances,
  MAX_RELANCES_DEFAUT,
} from "./relance/escalade";
// Run 7 / C2a : génération des brouillons de relance (Mode A, cron quotidien).
export {
  type GenererRelancesOptions,
  type GenererRelancesResult,
  genererBrouillonsRelances,
} from "./relance/generer";
export {
  type RelanceModele,
  type RelanceRendu,
  type RelanceVariables,
  renderRelance,
} from "./relance/render";
