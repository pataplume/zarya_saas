// Résolution PURE du régime TVA pour le matching des templates d'échéances (P0-5,
// AUDIT-MVP.md §8 — correctif du 16.07.2026 : « 0 échéance TVA générée, en silence »).
//
// Le filtre `regime_tva` de calendar.template_echeance est matché contre le régime porté
// par les services actifs du client (crm.service.parametres->>'regime_tva'). Le matching
// strict échouait en silence quand le régime n'était pas renseigné (NULL) alors même que
// le service TVA était actif avec une périodicité connue.
//
// RÈGLE PAR DÉFAUT (documentée) : en Suisse, la méthode de décompte ORDINAIRE est le
// décompte EFFECTIF (art. 35 s. LTVA — le décompte selon les taux de la dette fiscale
// nette / forfaitaire est une option sur demande à l'AFC). Quand le service TVA d'un
// client est actif avec une périodicité renseignée mais SANS régime explicite, on suppose
// donc la méthode effective correspondant à la périodicité :
//   mensuelle → 'mensuel' ; trimestrielle → 'effective_trimestre' ;
//   semestrielle → 'effective_semestre'.
// Annuelle/ponctuelle/absente : aucun défaut raisonnable (l'assistant de complétude du
// dossier client signale alors le blocage). Ce défaut sert UNIQUEMENT au matching des
// échéances — le champ en base reste NULL, et l'UI du dossier client affiche l'hypothèse
// (« méthode effective supposée »). Valeurs alignées sur regimeTvaSchema (@zarya/schemas)
// et le seed fédéral (migration 0006).

/** Projection d'un service actif du client, telle que lue par le moteur d'échéances. */
export interface ServicePourRegimeTva {
  /** Type de service (crm.type_service) : comptabilite | tva | salaires | … */
  type: string;
  /** Fréquence du service (crm.frequence_service) — périodicité TVA pour le service `tva`. */
  frequence: string | null;
  /** Régime explicite (parametres->>'regime_tva', fallback legacy 'regime') — NULL si absent. */
  regime_tva: string | null;
}

/**
 * Régime TVA par défaut (méthode effective, décompte ordinaire suisse) dérivé de la
 * périodicité du service TVA. NULL si aucun défaut raisonnable n'est dérivable.
 */
export function regimeTvaParDefaut(frequence: string | null): string | null {
  switch (frequence) {
    case "mensuelle":
      return "mensuel";
    case "trimestrielle":
      return "effective_trimestre";
    case "semestrielle":
      return "effective_semestre";
    default:
      // annuelle / ponctuelle / non renseignée : pas de défaut raisonnable.
      return null;
  }
}

/**
 * Régime TVA effectif d'un service pour le matching : le régime EXPLICITE prime toujours ;
 * à défaut, le régime par défaut dérivé de la périodicité — réservé au service `tva`
 * (les autres services ne portent un régime que s'il est explicite).
 */
export function regimeTvaEffectif(service: ServicePourRegimeTva): string | null {
  if (service.regime_tva) return service.regime_tva;
  if (service.type === "tva") return regimeTvaParDefaut(service.frequence);
  return null;
}

/**
 * Un template s'applique-t-il au client vis-à-vis de son filtre `regime_tva` ?
 * Sémantique fidèle au SQL historique (fn_generer_echeances) : NULL = tous régimes ;
 * sinon match si AU MOINS UN service actif porte (explicitement ou par défaut) un régime
 * listé. Un tableau vide (≠ NULL) ne matche rien, comme `= ANY('{}')`.
 */
export function templateMatcheRegimeTva(
  regimesTemplate: string[] | null,
  services: readonly ServicePourRegimeTva[],
): boolean {
  if (regimesTemplate === null) return true;
  return services.some((s) => {
    const regime = regimeTvaEffectif(s);
    return regime !== null && regimesTemplate.includes(regime);
  });
}
