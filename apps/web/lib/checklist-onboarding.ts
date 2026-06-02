// Checklist de documents attendus par (type de client × services) — Bloc F4 (onboarding-client §6.2).
// MVP : modèle CODÉ (pas de table crm.modele_checklist — arbitré founder ; perso cabinet = Phase 2).
// PUR, testable. Génère les `crm.document_attendu` à la configuration des services d'un client.

export type ServiceType =
  | "comptabilite"
  | "fiscalite"
  | "salaires"
  | "tva"
  | "bouclement"
  | "conseil";
export type ClientType = "pme" | "independant" | "prive" | "association";
export type CategorieDoc = "bancaire" | "fiscal" | "salaire" | "commercial" | "administratif";
export type Frequence = "mensuelle" | "trimestrielle" | "semestrielle" | "annuelle" | "ponctuelle";

export interface DocAttenduChecklist {
  type_document: string;
  categorie: CategorieDoc;
  frequence: Frequence;
  obligatoire: boolean;
  /** Service qui justifie ce document (→ service_id) ; null = transverse. */
  service: ServiceType | null;
}

// Documents standard par service (défauts MVP). Le type de client filtre ensuite (cf. ci-dessous).
const PAR_SERVICE: Record<ServiceType, DocAttenduChecklist[]> = {
  comptabilite: [
    {
      type_document: "releve_bancaire",
      categorie: "bancaire",
      frequence: "mensuelle",
      obligatoire: true,
      service: "comptabilite",
    },
    {
      type_document: "factures_achats",
      categorie: "commercial",
      frequence: "mensuelle",
      obligatoire: true,
      service: "comptabilite",
    },
    {
      type_document: "factures_ventes",
      categorie: "commercial",
      frequence: "mensuelle",
      obligatoire: true,
      service: "comptabilite",
    },
  ],
  tva: [
    {
      type_document: "decompte_tva",
      categorie: "fiscal",
      frequence: "trimestrielle",
      obligatoire: true,
      service: "tva",
    },
  ],
  salaires: [
    {
      type_document: "decompte_salaire",
      categorie: "salaire",
      frequence: "mensuelle",
      obligatoire: true,
      service: "salaires",
    },
    {
      type_document: "certificat_salaire",
      categorie: "salaire",
      frequence: "annuelle",
      obligatoire: true,
      service: "salaires",
    },
  ],
  bouclement: [
    {
      type_document: "bilan_comptes",
      categorie: "fiscal",
      frequence: "annuelle",
      obligatoire: true,
      service: "bouclement",
    },
  ],
  fiscalite: [
    {
      type_document: "declaration_impot",
      categorie: "fiscal",
      frequence: "annuelle",
      obligatoire: true,
      service: "fiscalite",
    },
  ],
  conseil: [],
};

/**
 * Checklist de documents attendus pour un client selon son type et ses services activés.
 * PUR. Dédupliqué par `type_document`. Règle de type : un particulier (`prive`) sans activité
 * commerciale n'a pas de factures de ventes (retirées si présentes).
 */
export function checklistPourServices(
  typeClient: ClientType,
  services: readonly ServiceType[],
): DocAttenduChecklist[] {
  const out: DocAttenduChecklist[] = [];
  const seen = new Set<string>();
  for (const s of services) {
    for (const d of PAR_SERVICE[s] ?? []) {
      if (typeClient === "prive" && d.type_document === "factures_ventes") continue;
      if (seen.has(d.type_document)) continue;
      seen.add(d.type_document);
      out.push(d);
    }
  }
  return out;
}
