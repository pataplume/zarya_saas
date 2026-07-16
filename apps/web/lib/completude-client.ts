// Lot 3 (ADR 0025) — Assistant de complétude du dossier client (cœur PUR, testable).
//
// Donne un SCORE de complétude + une CHECKLIST de « ce qui manque » — et surtout, par
// service activé, ce qui empêche la GÉNÉRATION D'ÉCHÉANCES (ex. « régime TVA requis pour
// générer les échéances TVA », « date de bouclement requise »). PUR : aucune I/O ; le
// lecteur DB (lib/completude-client-data.ts) projette l'état du client vers `CompletudeInput`,
// et le moteur `@zarya/calendar` (genererEcheancesPourClient) lit les MÊMES prérequis côté DB.
//
// Parcours NON BLOQUANT : la checklist guide sans contraindre. Rien n'empêche la sauvegarde —
// cette lib n'est qu'un indicateur (cf. ADR 0025 §1, arbitrage founder « édition libre + complétude »).

import type { ServiceType } from "./checklist-onboarding";

/** Régime TVA porté par service.parametres->>'regime_tva' (cf. genererEcheancesPourClient). */
export type RegimeTva =
  | "effective_trimestre"
  | "effective_semestre"
  | "forfaitaire_semestre"
  | "forfaitaire_annuel"
  | "mensuel";

/** Un service activé du client, avec les paramètres qui conditionnent ses échéances. */
export interface CompletudeService {
  type: ServiceType;
  /** Fréquence du service (peut être absente — édition non bloquante). */
  frequence: string | null;
  /** Régime TVA (service.parametres->>'regime_tva') — requis pour les échéances TVA. */
  regime_tva: RegimeTva | string | null;
}

/** Projection de l'état du client nécessaire au calcul de complétude (sans I/O). */
export interface CompletudeInput {
  /** Identité : présence des champs structurants (pas leur exactitude). */
  identite: {
    raison_sociale: string | null;
    type: string | null;
    ide: string | null;
  };
  /** Nombre de contacts non archivés. */
  nb_contacts: number;
  /** Au moins un contact marqué principal ? */
  a_contact_principal: boolean;
  /** Au moins une adresse non archivée avec un canton renseigné (échéances cantonales). */
  a_adresse_avec_canton: boolean;
  /** Nombre d'adresses non archivées. */
  nb_adresses: number;
  /** Services actifs du client. */
  services: CompletudeService[];
  /** Paramétrage comptable (1-1) — null si absent. */
  param_comptable: {
    date_bouclement: string | null;
  } | null;
  /** Config salaire (1-1) — null si absente. */
  salaire_config: {
    frequence_paie: string | null;
    date_validation_jour_du_mois: number | null;
  } | null;
}

/** Sévérité d'un item : `bloquant` empêche une génération d'échéance ; `recommande` = qualité du dossier. */
export type CompletudeSeverite = "bloquant" | "recommande";

export interface CompletudeItem {
  /** Clé stable (tests / i18n futur). */
  cle: string;
  /** Libellé FR actionnable (« ce qu'il faut faire »). */
  libelle: string;
  severite: CompletudeSeverite;
  /** Service concerné (null = transverse au dossier). */
  service: ServiceType | null;
  /** Ancre du dossier vers laquelle pointer (#identite, #services, #adresses…). */
  ancre: string;
}

export interface CompletudeResult {
  /** Score 0–100 (pondéré : items présents / total pondéré). 100 = rien ne manque. */
  score: number;
  /** Items manquants (bloquants + recommandés), dans l'ordre d'affichage. */
  manquants: CompletudeItem[];
  /** Raccourci : au moins un bloquant de génération d'échéance subsiste ? */
  a_bloquants: boolean;
}

// Poids relatifs : un bloquant pèse plus qu'un recommandé dans le score.
const POIDS_BLOQUANT = 2;
const POIDS_RECOMMANDE = 1;

/**
 * Calcule la complétude d'un dossier client. PUR et déterministe.
 *
 * Règles bloquantes (empêchent une génération d'échéance, alignées sur les filtres SQL de
 * genererEcheancesPourClient) :
 *  - service `tva` sans `regime_tva` NI périodicité dérivable → pas d'échéance TVA. Avec une
 *    périodicité mensuelle/trimestrielle/semestrielle, le moteur suppose désormais la méthode
 *    effective par défaut (P0-5, cf. packages/calendar/src/echeance/regime-tva.ts) : le régime
 *    manquant n'est alors que RECOMMANDÉ ;
 *  - service `bouclement` sans `param_comptable.date_bouclement` → date de bouclement inconnue ;
 *  - service `salaires` sans `salaire_config.date_validation_jour_du_mois` → jour de validation inconnu ;
 *  - aucune adresse avec canton alors qu'un service fiscal est actif → échéances cantonales impossibles.
 *
 * Règles recommandées (qualité du dossier, jamais bloquantes) :
 *  - identité (type, IDE), ≥1 contact, contact principal, ≥1 adresse, fréquence par service.
 */
export function calculerCompletude(input: CompletudeInput): CompletudeResult {
  const manquants: CompletudeItem[] = [];
  let poidsObtenu = 0;
  let poidsTotal = 0;

  // Helper : enregistre un critère (présent ou non) avec son poids, et empile l'item si absent.
  function critere(present: boolean, item: CompletudeItem): void {
    const poids = item.severite === "bloquant" ? POIDS_BLOQUANT : POIDS_RECOMMANDE;
    poidsTotal += poids;
    if (present) {
      poidsObtenu += poids;
    } else {
      manquants.push(item);
    }
  }

  // ── Identité (recommandé : structure le dossier, pas bloquant pour les échéances) ──
  critere(!!input.identite.type, {
    cle: "identite.type",
    libelle: "Renseignez le type de client (PME, indépendant…).",
    severite: "recommande",
    service: null,
    ancre: "#identite",
  });
  critere(!!input.identite.ide, {
    cle: "identite.ide",
    libelle: "Ajoutez le numéro IDE de l'entreprise (recherche Zefix possible).",
    severite: "recommande",
    service: null,
    ancre: "#identite",
  });

  // ── Contacts (recommandé : nécessaire aux relances, mais on ne bloque pas la génération) ──
  critere(input.nb_contacts > 0, {
    cle: "contacts.au_moins_un",
    libelle: "Ajoutez au moins un contact (indispensable pour les relances).",
    severite: "recommande",
    service: null,
    ancre: "#contacts",
  });
  if (input.nb_contacts > 0) {
    critere(input.a_contact_principal, {
      cle: "contacts.principal",
      libelle: "Désignez un contact principal.",
      severite: "recommande",
      service: null,
      ancre: "#contacts",
    });
  }

  // ── Adresses (recommandé en général) ──
  critere(input.nb_adresses > 0, {
    cle: "adresses.au_moins_une",
    libelle: "Ajoutez une adresse (siège).",
    severite: "recommande",
    service: null,
    ancre: "#adresses",
  });

  // ── Par service : prérequis de génération d'échéances ──
  const services = input.services;
  const aServiceTva = services.some((s) => s.type === "tva");
  const aServiceBouclement = services.some((s) => s.type === "bouclement");
  const aServiceSalaires = services.some((s) => s.type === "salaires");
  const aServiceFiscal = services.some((s) => s.type === "fiscalite");

  if (aServiceTva) {
    const regimeOk = services.some((s) => s.type === "tva" && !!s.regime_tva);
    // P0-5 : le moteur applique un régime PAR DÉFAUT (méthode effective, décompte ordinaire
    // suisse) dérivé de la périodicité du service TVA — règle miroir de
    // packages/calendar/src/echeance/regime-tva.ts (regimeTvaParDefaut). Le régime manquant
    // n'est donc bloquant QUE si aucun défaut n'est dérivable (périodicité absente,
    // annuelle ou ponctuelle).
    const defautDerivable = services.some(
      (s) =>
        s.type === "tva" &&
        (s.frequence === "mensuelle" ||
          s.frequence === "trimestrielle" ||
          s.frequence === "semestrielle"),
    );
    critere(regimeOk, {
      cle: "service.tva.regime",
      libelle: defautDerivable
        ? "Précisez le régime TVA — méthode effective supposée par défaut pour les échéances."
        : "Indiquez le régime TVA (ou la périodicité du service TVA) pour générer les échéances TVA.",
      severite: defautDerivable ? "recommande" : "bloquant",
      service: "tva",
      ancre: "#services",
    });
  }

  if (aServiceBouclement) {
    const bouclementOk = !!input.param_comptable?.date_bouclement;
    critere(bouclementOk, {
      cle: "service.bouclement.date",
      libelle: "Renseignez la date de bouclement pour générer l'échéance de bouclement.",
      severite: "bloquant",
      service: "bouclement",
      ancre: "#services",
    });
  }

  if (aServiceSalaires) {
    const jourOk = input.salaire_config?.date_validation_jour_du_mois != null;
    critere(jourOk, {
      cle: "service.salaires.jour_validation",
      libelle: "Définissez le jour de validation des salaires pour générer les échéances salaire.",
      severite: "bloquant",
      service: "salaires",
      ancre: "#services",
    });
  }

  if (aServiceFiscal) {
    // Les échéances fiscales cantonales nécessitent un canton (siège prioritaire).
    critere(input.a_adresse_avec_canton, {
      cle: "service.fiscalite.canton",
      libelle: "Ajoutez une adresse avec un canton pour générer les échéances fiscales cantonales.",
      severite: "bloquant",
      service: "fiscalite",
      ancre: "#adresses",
    });
  }

  // ── Fréquence renseignée par service (recommandé) ──
  for (const s of services) {
    critere(!!s.frequence, {
      cle: `service.${s.type}.frequence`,
      libelle: `Précisez la fréquence du service ${libelleServiceCourt(s.type)}.`,
      severite: "recommande",
      service: s.type,
      ancre: "#services",
    });
  }

  // Score : si aucun critère pondéré (dossier sans service ni rien), on considère 100
  // pour ne pas afficher 0/100 sur un client tout neuf — la checklist liste alors les
  // recommandations. En pratique les critères identité/contacts/adresses existent toujours.
  const score = poidsTotal === 0 ? 100 : Math.round((poidsObtenu / poidsTotal) * 100);
  const a_bloquants = manquants.some((m) => m.severite === "bloquant");

  // Ordre d'affichage : bloquants d'abord, puis recommandés (stable au sein de chaque groupe).
  const manquantsTries = [
    ...manquants.filter((m) => m.severite === "bloquant"),
    ...manquants.filter((m) => m.severite === "recommande"),
  ];

  return { score, manquants: manquantsTries, a_bloquants };
}

const LIBELLE_SERVICE_COURT: Record<ServiceType, string> = {
  comptabilite: "comptabilité",
  fiscalite: "fiscalité",
  salaires: "salaires",
  tva: "TVA",
  bouclement: "bouclement",
  conseil: "conseil",
};

function libelleServiceCourt(type: ServiceType): string {
  return LIBELLE_SERVICE_COURT[type] ?? type;
}
