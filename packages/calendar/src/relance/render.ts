import Handlebars from "handlebars";

/**
 * Rendu des relances — module Calendar, Run 5 (ADR 0011 §2).
 *
 * Étape 2 du pipeline de composition (calendar.md §5.2) : interpolation des
 * variables d'un modèle de relance (`calendar.modele_relance.objet` / `.corps`)
 * avec le contexte d'une échéance. UNIQUEMENT le rendu — la personnalisation IA
 * (§5.2.3), la signature (§5.2.4) et le stockage en brouillon (§5.2.5) sont des
 * runs ultérieurs (cf. addendum ADR 0011 : Run 7 pipeline d'envoi).
 *
 * Choix techniques :
 *  - **Handlebars logic-less** (ADR 0011 §2) : les modèles peuvent être rédigés
 *    par les cabinets (overrides `cabinet_id` renseigné). Un moteur logic-less
 *    évite toute exécution de code arbitraire à partir d'un template utilisateur,
 *    contrairement à une interpolation par template literals / eval.
 *  - **Environnement isolé** (`Handlebars.create()`) : pas de helper global
 *    partagé entre rendus, surface d'attaque minimale.
 *  - **`noEscape`** : les relances MVP sont du **texte brut** (pas du HTML). On ne
 *    veut donc pas que Handlebars échappe les entités HTML — sinon un nom comme
 *    « Müller & Co » deviendrait « Müller &amp; Co ». Quand un rendu HTML sera
 *    nécessaire (Run 7+), il faudra réactiver l'échappement sur ce canal.
 *  - **Non-strict** : une variable absente rend une chaîne vide plutôt que de
 *    lever. On RAPPORTE les variables manquantes (`variables_manquantes`) pour
 *    que la validation humaine (Mode A, §5.3) et les logs les détectent.
 */

/** Modèle source (sous-ensemble Handlebars de `calendar.modele_relance`). */
export interface RelanceModele {
  objet: string;
  corps: string;
}

/**
 * Variables canoniques d'une relance (alignées sur le seed du Run 2,
 * migration 0006 §9). Toutes pré-formatées côté appelant : `date_echeance` est
 * déjà une chaîne localisée (le rendu n'a aucune logique de date). La signature
 * d'index autorise des variables supplémentaires (overrides cabinet).
 */
export type RelanceVariables = {
  client_nom: string;
  echeance_libelle: string;
  date_echeance: string;
  responsable_nom: string;
  cabinet_nom: string;
  [key: string]: string | number;
};

/** Résultat d'un rendu de relance. */
export interface RelanceRendu {
  objet: string;
  corps: string;
  /**
   * Noms de variables référencées par le modèle (`{{var}}`) mais absentes ou
   * vides dans le contexte fourni — dédupliqués, ordre d'apparition. Sert de
   * garde-fou pour la validation humaine et l'observabilité.
   */
  variables_manquantes: string[];
}

/** Placeholders simples `{{ var }}` ou `{{{ var }}}` (noms identifiants, dottés tolérés). */
const PLACEHOLDER_RE = /\{\{\{?\s*([\w.]+)\s*\}?\}\}/g;

/** Extrait les noms de variables simples référencés par un template. */
function referencedVariables(template: string): string[] {
  const found: string[] = [];
  for (const match of Array.from(template.matchAll(PLACEHOLDER_RE))) {
    const name = match[1];
    if (name !== undefined && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Rend un modèle de relance (objet + corps) avec un contexte de variables.
 *
 * @param modele  Gabarits Handlebars (objet + corps).
 * @param vars    Contexte de variables. Des clés supplémentaires (overrides
 *                cabinet) sont tolérées via la signature indexée.
 * @returns       Objet et corps rendus + liste des variables manquantes.
 */
export function renderRelance(modele: RelanceModele, vars: RelanceVariables): RelanceRendu {
  const hb = Handlebars.create();
  const compileOpts = { noEscape: true, strict: false } as const;

  const objet = hb.compile(modele.objet, compileOpts)(vars);
  const corps = hb.compile(modele.corps, compileOpts)(vars);

  const referenced = [...referencedVariables(modele.objet), ...referencedVariables(modele.corps)];
  const variables_manquantes = referenced.filter((name, i, arr) => {
    if (arr.indexOf(name) !== i) return false; // dédup, garde la 1re occurrence
    const value = vars[name];
    return value === undefined || value === null || value === "";
  });

  return { objet, corps, variables_manquantes };
}
