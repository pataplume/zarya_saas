// F6b — Référentiel des champs employé (Swissdec-ready) : métadonnées, normalisation des
// en-têtes de colonnes (FR/DE/EN/IT), masquage des champs ultra-sensibles.
// PUR, testable. Réf : docs/data-model/salaire-schema.md §3 ; onboarding-client-schema.md §7.

/** Catégorie d'un champ (miroir salaire.categorie_champ). */
export type CategorieChamp =
  | "identite"
  | "coordonnees"
  | "statut_admin"
  | "contrat"
  | "remuneration";

/** Champs canoniques extraits/proposés (sous-ensemble de salaire.employe pertinent à l'onboarding). */
export const NOMS_CHAMP = [
  "prenom",
  "nom",
  "date_naissance",
  "sexe",
  "numero_avs",
  "nationalite",
  "adresse_rue",
  "adresse_npa",
  "adresse_ville",
  "email",
  "telephone",
  "iban",
  "permis_sejour",
  "canton_imposition",
  "etat_civil",
  "nb_enfants_charge",
  "fonction",
  "departement",
  "date_entree",
  "date_sortie",
  "taux_activite",
  "type_contrat",
  "salaire_base_mensuel",
  "salaire_horaire",
] as const;
export type NomChamp = (typeof NOMS_CHAMP)[number];

export const CATEGORIE_PAR_CHAMP: Record<NomChamp, CategorieChamp> = {
  prenom: "identite",
  nom: "identite",
  date_naissance: "identite",
  sexe: "identite",
  numero_avs: "identite",
  nationalite: "identite",
  adresse_rue: "coordonnees",
  adresse_npa: "coordonnees",
  adresse_ville: "coordonnees",
  email: "coordonnees",
  telephone: "coordonnees",
  iban: "coordonnees",
  permis_sejour: "statut_admin",
  canton_imposition: "statut_admin",
  etat_civil: "statut_admin",
  nb_enfants_charge: "statut_admin",
  fonction: "contrat",
  departement: "contrat",
  date_entree: "contrat",
  date_sortie: "contrat",
  taux_activite: "contrat",
  type_contrat: "contrat",
  salaire_base_mensuel: "remuneration",
  salaire_horaire: "remuneration",
};

/** Champs obligatoires pour un enregistrement de paie minimalement valide (Swissdec). */
export const CHAMPS_OBLIGATOIRES_SWISSDEC: ReadonlySet<NomChamp> = new Set<NomChamp>([
  "prenom",
  "nom",
  "date_naissance",
  "numero_avs",
  "date_entree",
]);

/** Champs ultra-sensibles chiffrés au Vault, JAMAIS en clair (ADR 0013). */
export const CHAMPS_SENSIBLES_VAULT: ReadonlySet<NomChamp> = new Set<NomChamp>([
  "numero_avs",
  "iban",
]);

// En-têtes de colonnes connus → champ canonique. Clés normalisées (minuscule, sans accent
// ni ponctuation). Couvre FR/DE/EN/IT des exports de paie courants (Bexio, Crésus, etc.).
const SYNONYMES: Record<string, NomChamp> = {
  // prenom
  prenom: "prenom",
  vorname: "prenom",
  firstname: "prenom",
  nome: "prenom",
  // nom
  nom: "nom",
  nomdefamille: "nom",
  name: "nom",
  nachname: "nom",
  cognome: "nom",
  lastname: "nom",
  // date de naissance
  datedenaissance: "date_naissance",
  naissance: "date_naissance",
  geburtsdatum: "date_naissance",
  dateofbirth: "date_naissance",
  ddn: "date_naissance",
  // sexe
  sexe: "sexe",
  genre: "sexe",
  geschlecht: "sexe",
  sex: "sexe",
  // AVS
  avs: "numero_avs",
  numeroavs: "numero_avs",
  noavs: "numero_avs",
  navs: "numero_avs",
  ahv: "numero_avs",
  ahvnummer: "numero_avs",
  ahvnr: "numero_avs",
  numerosecuritesociale: "numero_avs",
  // nationalite
  nationalite: "nationalite",
  nationalitat: "nationalite",
  nationality: "nationalite",
  // adresse
  rue: "adresse_rue",
  adresse: "adresse_rue",
  adresserue: "adresse_rue",
  strasse: "adresse_rue",
  street: "adresse_rue",
  npa: "adresse_npa",
  codepostal: "adresse_npa",
  plz: "adresse_npa",
  zip: "adresse_npa",
  ville: "adresse_ville",
  localite: "adresse_ville",
  ort: "adresse_ville",
  city: "adresse_ville",
  // contact
  email: "email",
  courriel: "email",
  mail: "email",
  telephone: "telephone",
  tel: "telephone",
  telefon: "telephone",
  phone: "telephone",
  // IBAN
  iban: "iban",
  compte: "iban",
  numerocompte: "iban",
  // statut admin
  permis: "permis_sejour",
  permisdesejour: "permis_sejour",
  bewilligung: "permis_sejour",
  permit: "permis_sejour",
  canton: "canton_imposition",
  cantonimposition: "canton_imposition",
  kanton: "canton_imposition",
  etatcivil: "etat_civil",
  zivilstand: "etat_civil",
  maritalstatus: "etat_civil",
  enfants: "nb_enfants_charge",
  nbenfants: "nb_enfants_charge",
  enfantsacharge: "nb_enfants_charge",
  kinder: "nb_enfants_charge",
  // contrat
  fonction: "fonction",
  poste: "fonction",
  funktion: "fonction",
  position: "fonction",
  departement: "departement",
  service: "departement",
  abteilung: "departement",
  dateentree: "date_entree",
  entree: "date_entree",
  eintritt: "date_entree",
  startdate: "date_entree",
  datesortie: "date_sortie",
  sortie: "date_sortie",
  austritt: "date_sortie",
  enddate: "date_sortie",
  taux: "taux_activite",
  tauxactivite: "taux_activite",
  tauxdactivite: "taux_activite",
  pensum: "taux_activite",
  beschaftigungsgrad: "taux_activite",
  typecontrat: "type_contrat",
  contrat: "type_contrat",
  vertrag: "type_contrat",
  // remuneration
  salaire: "salaire_base_mensuel",
  salairemensuel: "salaire_base_mensuel",
  salairebase: "salaire_base_mensuel",
  lohn: "salaire_base_mensuel",
  monatslohn: "salaire_base_mensuel",
  salary: "salaire_base_mensuel",
  salairehoraire: "salaire_horaire",
  stundenlohn: "salaire_horaire",
};

/** Normalise un libellé d'en-tête (minuscule, sans accent/ponctuation/espaces). */
export function clefEntete(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Mappe un en-tête de colonne brut vers un champ canonique, ou null si inconnu. */
export function normaliserEntete(brut: string): NomChamp | null {
  return SYNONYMES[clefEntete(brut)] ?? null;
}

/** Masque un numéro AVS (756.XXXX.XXXX.XX) → 756.****.****.** (affichage non sensible). */
export function masquerAvs(valeur: string): string {
  const chiffres = valeur.replace(/\D/g, "");
  if (chiffres.length < 4) return "***";
  return `${chiffres.slice(0, 3)}.****.****.**`;
}

/** Masque un IBAN → conserve pays + 2 derniers (CH..****1234). */
export function masquerIban(valeur: string): string {
  const compact = valeur.replace(/\s/g, "").toUpperCase();
  if (compact.length < 6) return "****";
  return `${compact.slice(0, 2)}..****${compact.slice(-4)}`;
}

/** Masque la valeur d'un champ sensible selon son type. */
export function masquerSensible(champ: NomChamp, valeur: string): string {
  if (champ === "numero_avs") return masquerAvs(valeur);
  if (champ === "iban") return masquerIban(valeur);
  return valeur;
}
