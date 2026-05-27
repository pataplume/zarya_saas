// Types pour l'API Zefix (Zentraler Firmenindex — registre du commerce suisse)
// Documentation : https://www.zefix.admin.ch/ZefixPublicREST/

export interface ZefixAddress {
  street?: string;
  houseNumber?: string;
  swissZipCode?: string;
  town?: string;
  countryIsoCode?: string;
  // Adresse structurée complète (certains endpoints)
  careOf?: string;
  postOfficeBoxNumber?: string;
  postOfficeBoxNumberFrom?: string;
  postOfficeBoxNumberTo?: string;
}

export interface ZefixLegalForm {
  id: string;
  name: { de?: string; fr?: string; it?: string; en?: string } | string;
}

export interface ZefixCompanySummary {
  ehraid: number;
  uid: string; // Format : CHE-XXX.XXX.XXX
  legalSeat?: string;
  legalForm?: ZefixLegalForm;
  status: "ACTIVE" | "IN_LIQUIDATION" | "DELETED" | string;
  name: string;
  address?: ZefixAddress;
  cantons?: string[];
  registrationDate?: string;
  deleteDate?: string;
}

export interface ZefixCompanyDetail extends ZefixCompanySummary {
  purpose?: string;
  capitalNominal?: number;
  capitalPaidIn?: number;
  capitalCurrency?: string;
  shabDate?: string;
  shabRef?: string;
  registerOffice?: string;
  // Organes (administrateurs, signataires)
  publications?: ZefixPublication[];
}

export interface ZefixPublication {
  shabDate?: string;
  message?: string;
}

// Réponse normalisée interne ZARYA (indépendante de la structure Zefix)
export interface ZefixResultat {
  ehraid: string;
  ide: string; // CHE-XXX.XXX.XXX
  raison_sociale: string;
  forme_juridique?: string;
  statut: "actif" | "en_liquidation" | "radie" | "inconnu";
  adresse_rue?: string;
  adresse_npa?: string;
  adresse_ville?: string;
  adresse_canton?: string;
  date_inscription_rc?: string;
  capital_social?: string;
  capital_devise?: string;
  but_statutaire?: string;
}
