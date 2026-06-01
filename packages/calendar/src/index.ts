// @zarya/calendar — logique de domaine du module Calendar.
// Run 5 : rendu des relances (interpolation Handlebars logic-less). ADR 0011 §2.

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
