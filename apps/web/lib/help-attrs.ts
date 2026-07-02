// Attributs d'aide contextuelle « mode guide » — à étaler sur n'importe quel
// élément cliquable (bouton, lien, ligne, champ…). Le provider (client) lit ces
// attributs via un écouteur délégué et affiche la carte d'aide au survol/focus.
// Module server-safe (pas de "use client") : utilisable dans les Server Components.

export type HelpAttrs = {
  "data-help-title": string;
  "data-help-body": string;
};

/**
 * @param title Nom court de l'élément (« Valider la facture »)
 * @param body  Ce que ça fait + comment l'utiliser, en une ou deux phrases.
 */
export function helpAttrs(title: string, body: string): HelpAttrs {
  return { "data-help-title": title, "data-help-body": body };
}
