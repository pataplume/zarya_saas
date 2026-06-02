// @zarya/calendar — logique de domaine du module Calendar.
// Run 5 : rendu des relances (interpolation Handlebars logic-less). ADR 0011 §2.

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
