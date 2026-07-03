import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, cabinetMembre, client, contact } from "./crm";
import { document } from "./doc";

// Namespace Postgres salaire.* — module Salaire (Bloc F0 : schéma minimal consommé par
// l'onboarding-client). Réf : onboarding-client-schema.md, salaire-schema.md §3/§12.
// AVS/IBAN ultra-sensibles stockés ANTI-CLAIR (UUID de secret Vault) — ADR 0013.
export const salaireSchema = pgSchema("salaire");

export const sexeEnum = salaireSchema.enum("sexe", ["m", "f", "autre"]);
export const etatCivilEnum = salaireSchema.enum("etat_civil", [
  "celibataire",
  "marie",
  "divorce",
  "veuf",
  "partenariat",
]);
export const confessionEnum = salaireSchema.enum("confession", [
  "aucune",
  "catholique_romaine",
  "protestante",
  "autre",
]);
export const typeContratEnum = salaireSchema.enum("type_contrat", [
  "cdi",
  "cdd",
  "apprentissage",
  "stage",
  "auxiliaire",
  "independant",
]);
export const statutEmployeEnum = salaireSchema.enum("statut_employe", [
  "propose",
  "actif",
  "sorti",
  "archive",
]);
export const roleAccesClientEnum = salaireSchema.enum("role_acces_client", [
  "rh",
  "dirigeant",
  "admin",
]);

// ─── Enums F6a — cluster propositions onboarding (onboarding-client-schema.md §2) ──
export const statutSessionOnboardingEnum = salaireSchema.enum("statut_session_onboarding", [
  "initialisee",
  "etape_1_en_cours",
  "etape_2_en_cours",
  "etape_3_en_cours",
  "terminee",
  "abandonnee",
]);
export const statutPropositionEmployeEnum = salaireSchema.enum("statut_proposition_employe", [
  "en_attente",
  "validee",
  "rejetee",
  "fusionnee",
  "echec_extraction",
]);
export const statutPropositionChampEnum = salaireSchema.enum("statut_proposition_champ", [
  "propose",
  "valide",
  "modifie",
  "rejete",
  "manquant",
]);
export const typeSourceUploadEnum = salaireSchema.enum("type_source_upload", [
  "excel_structure",
  "excel_libre",
  "csv",
  "pdf_contrat",
  "pdf_attestation",
  "image_scan",
  "inconnu",
]);
export const typeModeleExtractionEnum = salaireSchema.enum("type_modele_extraction", [
  "chat_large",
  "chat_small",
  "vision",
  "autre",
]);
export const statutUploadExtractionEnum = salaireSchema.enum("statut_upload_extraction", [
  "pending",
  "en_cours",
  "termine",
  "echec",
]);
export const statutExtractionIaEnum = salaireSchema.enum("statut_extraction_ia", [
  "en_cours",
  "succes",
  "echec_partiel",
  "echec_total",
]);
export const categorieChampEnum = salaireSchema.enum("categorie_champ", [
  "identite",
  "coordonnees",
  "statut_admin",
  "contrat",
  "remuneration",
]);
export const acteurOnboardingEnum = salaireSchema.enum("acteur_onboarding", [
  "client",
  "fiduciaire",
]);

// ─── salaire.employe — référentiel hybride par client (Swissdec-ready) ─────────
export const employe = salaireSchema.table(
  "employe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    numero_externe: text("numero_externe"),
    prenom: text("prenom").notNull(),
    nom: text("nom").notNull(),
    date_naissance: date("date_naissance"),
    sexe: sexeEnum("sexe"),
    // ANTI-CLAIR : UUID du secret Vault (numéro AVS), jamais en clair.
    numero_avs_vault_id: uuid("numero_avs_vault_id"),
    nationalite: text("nationalite"),
    permis_sejour: text("permis_sejour"),
    canton_imposition: text("canton_imposition"),
    commune_imposition: text("commune_imposition"),
    etat_civil: etatCivilEnum("etat_civil"),
    nb_enfants_charge: integer("nb_enfants_charge"),
    confession: confessionEnum("confession"),
    adresse_rue: text("adresse_rue"),
    adresse_npa: text("adresse_npa"),
    adresse_ville: text("adresse_ville"),
    adresse_pays: text("adresse_pays").default("CH"),
    // ANTI-CLAIR : UUID du secret Vault (IBAN de versement salaire), jamais en clair.
    iban_vault_id: uuid("iban_vault_id"),
    email: text("email"),
    telephone: text("telephone"),
    fonction: text("fonction"),
    departement: text("departement"),
    date_entree: date("date_entree"),
    date_sortie: date("date_sortie"),
    motif_sortie: text("motif_sortie"),
    taux_activite: numeric("taux_activite", { precision: 5, scale: 2 }),
    type_contrat: typeContratEnum("type_contrat"),
    salaire_base_mensuel: numeric("salaire_base_mensuel", { precision: 10, scale: 2 }),
    salaire_horaire: numeric("salaire_horaire", { precision: 8, scale: 2 }),
    nombre_versements_annuels: integer("nombre_versements_annuels").default(12),
    statut: statutEmployeEnum("statut").notNull().default("propose"),
    confirme_dans_paie: boolean("confirme_dans_paie").notNull().default(false),
    date_confirmation_paie: timestamp("date_confirmation_paie", { withTimezone: true }),
    notes: text("notes"),
    // ─── Traçabilité onboarding (F6a, additif) ─────────────────────────────────
    cree_via_onboarding: boolean("cree_via_onboarding").notNull().default(false),
    session_onboarding_id: uuid("session_onboarding_id").references(() => sessionOnboarding.id, {
      onDelete: "set null",
    }),
    // FK → salaire.proposition_employe posée par la migration (DB). Pas de .references()
    // Drizzle ici : romprait le cycle de types employe↔proposition_employe (les deux se
    // référencent mutuellement). L'intégrité reste garantie par la contrainte SQL.
    proposition_employe_id: uuid("proposition_employe_id").unique(),
    documents_sources: uuid("documents_sources").array(),
    confiance_globale_initiale: numeric("confiance_globale_initiale", { precision: 3, scale: 2 }),
    ids_externes: jsonb("ids_externes"),
    derniere_synchronisation: jsonb("derniere_synchronisation"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_employe_client_statut").on(t.cabinet_id, t.client_id, t.statut),
    uniqueIndex("uniq_employe_numero_externe")
      .on(t.cabinet_id, t.client_id, t.numero_externe)
      .where(sql`${t.numero_externe} IS NOT NULL`),
  ],
);

// ─── salaire.acces_client — comptes contacts RH client (mini-dashboard) ────────
export const accesClient = salaireSchema.table(
  "acces_client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    contact_id: uuid("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "restrict" }),
    // auth.users géré par Supabase : uuid simple sans FK.
    auth_user_id: uuid("auth_user_id").unique(),
    email: text("email").notNull(),
    role: roleAccesClientEnum("role").notNull().default("rh"),
    actif: boolean("actif").notNull().default(true),
    date_activation: timestamp("date_activation", { withTimezone: true }),
    derniere_connexion: timestamp("derniere_connexion", { withTimezone: true }),
    nb_connexions: integer("nb_connexions").notNull().default(0),
    nb_validations_effectuees: integer("nb_validations_effectuees").notNull().default(0),
    token_activation: text("token_activation"),
    token_activation_expire_le: timestamp("token_activation_expire_le", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid("created_by"),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_acces_client_actif").on(t.cabinet_id, t.client_id, t.actif),
    index("idx_acces_client_auth_user").on(t.auth_user_id),
  ],
);

// ═══ F6a — cluster propositions onboarding (référentiel employés IA) ═══════════
// Multi-tenant : cabinet_id + client_id dénormalisés partout (précédent facture 0030)
// → trigger crm.fn_check_client_cabinet. RLS 4 policies. Réf onboarding-client-schema.md.

// ─── salaire.session_onboarding — 1 session par client, persistante ────────────
export const sessionOnboarding = salaireSchema.table(
  "session_onboarding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .unique()
      .references(() => client.id, { onDelete: "restrict" }),
    statut: statutSessionOnboardingEnum("statut").notNull().default("initialisee"),
    date_demarrage: timestamp("date_demarrage", { withTimezone: true }).notNull().defaultNow(),
    date_derniere_activite: timestamp("date_derniere_activite", { withTimezone: true })
      .notNull()
      .defaultNow(),
    date_fin: timestamp("date_fin", { withTimezone: true }),
    etape_1_terminee_at: timestamp("etape_1_terminee_at", { withTimezone: true }),
    etape_2_terminee_at: timestamp("etape_2_terminee_at", { withTimezone: true }),
    etape_3a_terminee_at: timestamp("etape_3a_terminee_at", { withTimezone: true }),
    etape_3b_terminee_at: timestamp("etape_3b_terminee_at", { withTimezone: true }),
    nb_employes_attendus: integer("nb_employes_attendus"),
    nb_employes_proposes: integer("nb_employes_proposes").notNull().default(0),
    nb_employes_valides: integer("nb_employes_valides").notNull().default(0),
    nb_uploads: integer("nb_uploads").notNull().default(0),
    consentement_zefix: boolean("consentement_zefix").notNull().default(false),
    consentement_zefix_at: timestamp("consentement_zefix_at", { withTimezone: true }),
    consentement_nlpd_traitement: boolean("consentement_nlpd_traitement").notNull().default(false),
    consentement_nlpd_at: timestamp("consentement_nlpd_at", { withTimezone: true }),
    dernier_acteur_type: acteurOnboardingEnum("dernier_acteur_type"),
    dernier_acteur_id: uuid("dernier_acteur_id"),
    notes_client: text("notes_client"),
    notes_fiduciaire: text("notes_fiduciaire"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_session_onboarding_relance").on(t.cabinet_id, t.statut, t.date_derniere_activite),
  ],
);

// ─── salaire.upload_fichier — fichiers uploadés pendant l'onboarding ───────────
export const uploadFichier = salaireSchema.table(
  "upload_fichier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessionOnboarding.id, { onDelete: "cascade" }),
    document_id: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "restrict" }),
    nom_fichier_original: text("nom_fichier_original").notNull(),
    taille_octets: bigint("taille_octets", { mode: "number" }),
    type_mime: text("type_mime"),
    type_source_detecte: typeSourceUploadEnum("type_source_detecte"),
    categorie_declaree: text("categorie_declaree"),
    uploaded_par_type: acteurOnboardingEnum("uploaded_par_type").notNull(),
    uploaded_par_id: uuid("uploaded_par_id"),
    uploaded_at: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    statut_extraction: statutUploadExtractionEnum("statut_extraction").notNull().default("pending"),
    date_extraction_demarree: timestamp("date_extraction_demarree", { withTimezone: true }),
    date_extraction_terminee: timestamp("date_extraction_terminee", { withTimezone: true }),
    message_erreur: text("message_erreur"),
    nb_employes_extraits: integer("nb_employes_extraits"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_upload_fichier_session").on(t.cabinet_id, t.session_id, t.uploaded_at),
    index("idx_upload_fichier_statut").on(t.cabinet_id, t.statut_extraction),
  ],
);

// ─── salaire.extraction_ia — 1 passe LLM sur un fichier (audit + ré-extraction) ──
export const extractionIa = salaireSchema.table(
  "extraction_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    upload_fichier_id: uuid("upload_fichier_id")
      .notNull()
      .references(() => uploadFichier.id, { onDelete: "cascade" }),
    numero_passe: integer("numero_passe").notNull().default(1),
    modele_utilise: typeModeleExtractionEnum("modele_utilise").notNull(),
    modele_version_exacte: text("modele_version_exacte"),
    prompt_version: text("prompt_version"),
    // ID de requête Infomaniak pour cross-référence (ADR 0010).
    requete_externe_id: text("requete_externe_id"),
    donnees_brutes: jsonb("donnees_brutes"),
    nb_employes_detectes: integer("nb_employes_detectes"),
    confiance_globale: numeric("confiance_globale", { precision: 3, scale: 2 }),
    date_debut: timestamp("date_debut", { withTimezone: true }).notNull().defaultNow(),
    date_fin: timestamp("date_fin", { withTimezone: true }),
    duree_ms: integer("duree_ms"),
    tokens_input: integer("tokens_input"),
    tokens_output: integer("tokens_output"),
    cout_estime_chf: numeric("cout_estime_chf", { precision: 8, scale: 4 }),
    statut: statutExtractionIaEnum("statut").notNull().default("en_cours"),
    message_erreur: text("message_erreur"),
    utilise_par_passe_suivante: boolean("utilise_par_passe_suivante").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_extraction_ia_fichier").on(t.cabinet_id, t.upload_fichier_id, t.numero_passe)],
);

// ─── salaire.proposition_employe — employé proposé, en attente de validation ───
export const propositionEmploye = salaireSchema.table(
  "proposition_employe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    session_id: uuid("session_id")
      .notNull()
      .references(() => sessionOnboarding.id, { onDelete: "cascade" }),
    // NULLABLE : extraction IA (non-null) OU saisie manuelle (null) — 3 modes onboarding.
    extraction_id: uuid("extraction_id").references(() => extractionIa.id, {
      onDelete: "set null",
    }),
    numero_dans_extraction: integer("numero_dans_extraction"),
    statut: statutPropositionEmployeEnum("statut").notNull().default("en_attente"),
    confiance_globale: numeric("confiance_globale", { precision: 3, scale: 2 }),
    anomalies_detectees: jsonb("anomalies_detectees"),
    doublons_potentiels: uuid("doublons_potentiels").array(),
    fusionnee_avec_id: uuid("fusionnee_avec_id"),
    employe_id: uuid("employe_id")
      .unique()
      .references(() => employe.id, { onDelete: "set null" }),
    rejetee_motif: text("rejetee_motif"),
    sources_documents: uuid("sources_documents").array(),
    date_validation: timestamp("date_validation", { withTimezone: true }),
    valide_par_type: acteurOnboardingEnum("valide_par_type"),
    valide_par_id: uuid("valide_par_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_proposition_employe_session").on(t.cabinet_id, t.session_id, t.statut),
    index("idx_proposition_employe_employe").on(t.employe_id),
  ],
);

// ─── salaire.proposition_champ — granularité champ-par-champ (ADR 0007) ────────
export const propositionChamp = salaireSchema.table(
  "proposition_champ",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    proposition_employe_id: uuid("proposition_employe_id")
      .notNull()
      .references(() => propositionEmploye.id, { onDelete: "cascade" }),
    nom_champ: text("nom_champ").notNull(),
    categorie: categorieChampEnum("categorie"),
    valeur_proposee: text("valeur_proposee"),
    valeur_proposee_normalisee: jsonb("valeur_proposee_normalisee"),
    confiance: numeric("confiance", { precision: 3, scale: 2 }).notNull(),
    source_document_id: uuid("source_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    source_page: integer("source_page"),
    source_bbox: jsonb("source_bbox"),
    source_cellule: text("source_cellule"),
    source_texte_extrait: text("source_texte_extrait"),
    obligatoire_swissdec: boolean("obligatoire_swissdec").notNull().default(false),
    statut: statutPropositionChampEnum("statut").notNull().default("propose"),
    valeur_finale: text("valeur_finale"),
    modifie_par_type: acteurOnboardingEnum("modifie_par_type"),
    modifie_par_id: uuid("modifie_par_id"),
    date_validation: timestamp("date_validation", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_proposition_champ").on(t.proposition_employe_id, t.nom_champ),
    index("idx_proposition_champ_statut").on(t.proposition_employe_id, t.statut),
    index("idx_proposition_champ_swissdec").on(t.proposition_employe_id, t.obligatoire_swissdec),
  ],
);

// ═══ G1a — Cœur du cycle mensuel salaire (workflow, PAS de calcul de paie) ═════
// cabinet_id + client_id dénormalisés (précédent facture 0030) ; type_element_paie =
// catalogue (cabinet_id NULL global). Réf : salaire-schema.md §2/§4-10/§15 ; migration 0036.

export const statutPeriodeEnum = salaireSchema.enum("statut_periode", [
  "non_demandee",
  "en_attente",
  "relancee",
  "validee",
  "en_retard",
  "exportee",
  "cloturee",
  "non_applicable",
]);
export const logicielPaieCibleEnum = salaireSchema.enum("logiciel_paie_cible", [
  "bexio_payroll",
  "cresus_salaires",
  "winbiz_salaires",
  "abacus_lohn",
  "swiss21",
  "banana",
  "autre",
  "aucun",
]);
export const acteurModifEnum = salaireSchema.enum("acteur_modif", [
  "client",
  "fiduciaire",
  "systeme",
]);
export const uniteElementEnum = salaireSchema.enum("unite_element", [
  "heures",
  "jours",
  "montant_chf",
  "pourcentage",
  "nombre",
  "texte",
]);
export const categorieElementEnum = salaireSchema.enum("categorie_element", [
  "temps_travail",
  "prime",
  "indemnite",
  "retenue",
  "frais",
  "autre",
]);
export const sourceElementEnum = salaireSchema.enum("source_element", [
  "pre_remplie",
  "client_dashboard",
  "fiduciaire_saisie",
  "import_pj",
  "ia_extraction",
]);
export const typeAbsenceEnum = salaireSchema.enum("type_absence", [
  "maladie",
  "accident_pro",
  "accident_non_pro",
  "maternite",
  "paternite",
  "service_militaire",
  "conge_non_paye",
  "conge_paye",
  "autre",
]);
export const assuranceAbsenceEnum = salaireSchema.enum("assurance_absence", [
  "aucune",
  "accident_lpp",
  "accident_laanp",
  "ijm",
  "apg",
]);
export const sourceAbsenceEnum = salaireSchema.enum("source_absence", [
  "client_dashboard",
  "fiduciaire_saisie",
  "import_pj",
]);
export const typeChangementEnum = salaireSchema.enum("type_changement", [
  "entree",
  "sortie",
  "changement_salaire",
  "changement_taux",
  "conge_non_paye",
  "maladie_longue",
  "accident",
  "maternite_paternite",
  "service_militaire",
  "autre",
]);
export const sourceChangementEnum = salaireSchema.enum("source_changement", [
  "client_dashboard",
  "fiduciaire_saisie",
  "ia_extraction",
]);
export const valideParValidationEnum = salaireSchema.enum("valide_par_validation", [
  "client",
  "fiduciaire_pour_client",
]);
export const methodeValidationEnum = salaireSchema.enum("methode_validation", [
  "dashboard",
  "email_reponse",
  "email_avec_piece",
  "confirmation_manuelle",
]);
export const acteurEvenementSalaireEnum = salaireSchema.enum("acteur_evenement", [
  "humain_fiduciaire",
  "humain_client",
  "systeme",
  "ia",
]);
export const typeEvenementSalaireEnum = salaireSchema.enum("type_evenement", [
  "periode_creee",
  "periode_pre_remplie",
  "notification_envoyee",
  "relance_envoyee",
  "connexion_client_dashboard",
  "element_paie_saisi",
  "element_paie_modifie",
  "absence_declaree",
  "changement_declare",
  "changement_applique_referentiel",
  "employe_propose",
  "employe_confirme",
  "employe_sorti",
  "piece_uploadee",
  "validation_recue_client",
  "validation_par_fiduciaire",
  "export_genere",
  "export_telecharge",
  "import_confirme",
  "periode_clotturee",
  "periode_reouverte",
  "statut_modifie",
  "note_ajoutee",
  "connexion_client_echec",
]);

// ─── salaire.periode ──────────────────────────────────────────────────────────
export const periode = salaireSchema.table(
  "periode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    annee: integer("annee").notNull(),
    mois: integer("mois").notNull(),
    statut: statutPeriodeEnum("statut").notNull().default("non_demandee"),
    date_notification_envoyee: timestamp("date_notification_envoyee", { withTimezone: true }),
    date_validation_recue: timestamp("date_validation_recue", { withTimezone: true }),
    date_export_genere: timestamp("date_export_genere", { withTimezone: true }),
    date_import_confirme: timestamp("date_import_confirme", { withTimezone: true }),
    date_limite_validation: date("date_limite_validation").notNull(),
    date_cloture: timestamp("date_cloture", { withTimezone: true }),
    pre_remplie: boolean("pre_remplie").notNull().default(false),
    pre_remplie_depuis: uuid("pre_remplie_depuis"),
    derniere_modification_par: acteurModifEnum("derniere_modification_par"),
    derniere_modification_acteur_id: uuid("derniere_modification_acteur_id"),
    derniere_modification_at: timestamp("derniere_modification_at", { withTimezone: true }),
    nb_employes_concernes: integer("nb_employes_concernes").notNull().default(0),
    nb_changements_declares: integer("nb_changements_declares").notNull().default(0),
    sans_changement_declare: boolean("sans_changement_declare").notNull().default(false),
    non_applicable: boolean("non_applicable").notNull().default(false),
    non_applicable_motif: text("non_applicable_motif"),
    notes_internes_fiduciaire: text("notes_internes_fiduciaire"),
    notes_client: text("notes_client"),
    gestionnaire_id: uuid("gestionnaire_id"),
    logiciel_paie_cible: logicielPaieCibleEnum("logiciel_paie_cible"),
    // G4b — jalon de revue fiduciaire (« validee_cabinet », migration 0039).
    revue_fiduciaire_at: timestamp("revue_fiduciaire_at", { withTimezone: true }),
    revue_fiduciaire_par: uuid("revue_fiduciaire_par"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_periode_client_mois").on(t.client_id, t.annee, t.mois),
    index("idx_periode_statut").on(t.cabinet_id, t.statut, t.date_limite_validation),
    index("idx_periode_client").on(t.cabinet_id, t.client_id, t.annee, t.mois),
  ],
);

// ─── salaire.type_element_paie (catalogue) ───────────────────────────────────
export const typeElementPaie = salaireSchema.table("type_element_paie", {
  id: uuid("id").primaryKey().defaultRandom(),
  cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  libelle_fr: text("libelle_fr").notNull(),
  libelle_de: text("libelle_de"),
  libelle_it: text("libelle_it"),
  description_client: text("description_client"),
  unite: uniteElementEnum("unite").notNull(),
  categorie: categorieElementEnum("categorie").notNull(),
  recurrent: boolean("recurrent").notNull().default(false),
  visible_client: boolean("visible_client").notNull().default(true),
  ordre_affichage: integer("ordre_affichage").notNull().default(100),
  actif: boolean("actif").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── salaire.element_paie ─────────────────────────────────────────────────────
export const elementPaie = salaireSchema.table(
  "element_paie",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    employe_id: uuid("employe_id")
      .notNull()
      .references(() => employe.id, { onDelete: "restrict" }),
    type_element_id: uuid("type_element_id")
      .notNull()
      .references(() => typeElementPaie.id, { onDelete: "restrict" }),
    valeur_numerique: numeric("valeur_numerique", { precision: 12, scale: 4 }),
    valeur_texte: text("valeur_texte"),
    commentaire: text("commentaire"),
    source: sourceElementEnum("source").notNull(),
    origine_element_id: uuid("origine_element_id"),
    modifie_par_acteur_type: acteurModifEnum("modifie_par_acteur_type"),
    modifie_par_acteur_id: uuid("modifie_par_acteur_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_element_paie").on(t.periode_id, t.employe_id, t.type_element_id),
    index("idx_element_paie_periode").on(t.cabinet_id, t.periode_id, t.employe_id),
    index("idx_element_paie_type").on(t.periode_id, t.type_element_id),
  ],
);

// ─── salaire.absence ──────────────────────────────────────────────────────────
export const absence = salaireSchema.table(
  "absence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    employe_id: uuid("employe_id")
      .notNull()
      .references(() => employe.id, { onDelete: "restrict" }),
    type: typeAbsenceEnum("type").notNull(),
    date_debut: date("date_debut").notNull(),
    date_fin: date("date_fin").notNull(),
    nb_jours_ouvres: numeric("nb_jours_ouvres", { precision: 4, scale: 1 }),
    nb_jours_calendaires: integer("nb_jours_calendaires"),
    pourcentage_incapacite: integer("pourcentage_incapacite"),
    certificat_medical_recu: boolean("certificat_medical_recu").notNull().default(false),
    certificat_document_id: uuid("certificat_document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    assurance_concernee: assuranceAbsenceEnum("assurance_concernee"),
    montant_avance_employeur: numeric("montant_avance_employeur", { precision: 10, scale: 2 }),
    source: sourceAbsenceEnum("source").notNull(),
    commentaire: text("commentaire"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_absence_periode").on(t.cabinet_id, t.periode_id, t.employe_id),
    index("idx_absence_employe").on(t.employe_id, t.date_debut),
  ],
);

// ─── salaire.changement ───────────────────────────────────────────────────────
export const changement = salaireSchema.table(
  "changement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    employe_id: uuid("employe_id").references(() => employe.id, { onDelete: "set null" }),
    type: typeChangementEnum("type").notNull(),
    date_effet: date("date_effet").notNull(),
    description: text("description"),
    montant_impact: numeric("montant_impact", { precision: 10, scale: 2 }),
    ancien_taux_activite: numeric("ancien_taux_activite", { precision: 5, scale: 2 }),
    nouveau_taux_activite: numeric("nouveau_taux_activite", { precision: 5, scale: 2 }),
    ancien_salaire_base: numeric("ancien_salaire_base", { precision: 10, scale: 2 }),
    nouveau_salaire_base: numeric("nouveau_salaire_base", { precision: 10, scale: 2 }),
    piece_justificative_id: uuid("piece_justificative_id").references(() => document.id, {
      onDelete: "set null",
    }),
    source: sourceChangementEnum("source").notNull(),
    confiance_extraction: numeric("confiance_extraction", { precision: 3, scale: 2 }),
    valide_par_fiduciaire: boolean("valide_par_fiduciaire").notNull().default(false),
    applique_dans_referentiel: boolean("applique_dans_referentiel").notNull().default(false),
    confirme_dans_paie: boolean("confirme_dans_paie").notNull().default(false),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_changement_periode").on(t.cabinet_id, t.periode_id),
    index("idx_changement_employe").on(t.employe_id),
  ],
);

// ─── salaire.validation (1 par période) ──────────────────────────────────────
export const validationPeriode = salaireSchema.table(
  "validation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .unique()
      .references(() => periode.id, { onDelete: "cascade" }),
    valide_par_type: valideParValidationEnum("valide_par_type").notNull(),
    valideur_contact_id: uuid("valideur_contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    valideur_user_id: uuid("valideur_user_id"),
    methode: methodeValidationEnum("methode").notNull(),
    date_validation: timestamp("date_validation", { withTimezone: true }).notNull().defaultNow(),
    message: text("message"),
    sans_changement_confirme: boolean("sans_changement_confirme").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_validation_periode").on(t.cabinet_id, t.periode_id)],
);

// ─── salaire.evenement (journal append-only) ─────────────────────────────────
export const evenementSalaire = salaireSchema.table(
  "evenement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id").references(() => periode.id, { onDelete: "set null" }),
    client_id: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    type: typeEvenementSalaireEnum("type").notNull(),
    acteur_type: acteurEvenementSalaireEnum("acteur_type"),
    acteur_id: uuid("acteur_id"),
    description: text("description"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_evenement_periode").on(t.cabinet_id, t.periode_id, t.created_at),
    index("idx_evenement_client").on(t.cabinet_id, t.client_id, t.created_at),
  ],
);

// ═══ G1b — Export + notifications du cycle salaire ════════════════════════════
// format_export/mapping_export = catalogues (cabinet_id NULL global). export/notification/
// relance/piece = scopés (cabinet_id+client_id). Réf : salaire-schema.md §9/§11/§13/§14 ; migration 0037.

export const formatFichierExportEnum = salaireSchema.enum("format_fichier_export", [
  "csv",
  "xlsx",
  "xml",
  "txt",
]);
export const statutExportEnum = salaireSchema.enum("statut_export", [
  "genere",
  "telecharge",
  "importe",
  "erreur",
]);
export const typeNotificationEnum = salaireSchema.enum("type_notification", [
  "initiale",
  "confirmation_validation",
  "modification_fiduciaire",
  "cloture",
]);
export const statutEnvoiNotifEnum = salaireSchema.enum("statut_envoi_notif", [
  "envoyee",
  "echec",
  "bounce",
]);
export const langueNotifEnum = salaireSchema.enum("langue_notif", ["fr", "de", "it", "en"]);
export const categoriePieceEnum = salaireSchema.enum("categorie_piece", [
  "heures",
  "absences",
  "frais",
  "contrat",
  "medical",
  "autre",
]);
export const sourcePieceEnum = salaireSchema.enum("source_piece", [
  "client_dashboard",
  "fiduciaire_upload",
  "email_client",
]);

// ─── salaire.format_export (catalogue) ───────────────────────────────────────
export const formatExport = salaireSchema.table("format_export", {
  id: uuid("id").primaryKey().defaultRandom(),
  cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  nom: text("nom").notNull(),
  logiciel_cible: logicielPaieCibleEnum("logiciel_cible").notNull(),
  version: text("version"),
  format_fichier: formatFichierExportEnum("format_fichier").notNull(),
  encodage: text("encodage").default("utf-8"),
  separateur_csv: text("separateur_csv"),
  date_format: text("date_format"),
  nombre_format: text("nombre_format"),
  actif: boolean("actif").notNull().default(true),
  documentation_url: text("documentation_url"),
  notes_internes: text("notes_internes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── salaire.mapping_export (catalogue) ──────────────────────────────────────
export const mappingExportSalaire = salaireSchema.table(
  "mapping_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "cascade" }),
    format_export_id: uuid("format_export_id")
      .notNull()
      .references(() => formatExport.id, { onDelete: "cascade" }),
    type_element_id: uuid("type_element_id").references(() => typeElementPaie.id, {
      onDelete: "set null",
    }),
    champ_zarya: text("champ_zarya"),
    champ_cible: text("champ_cible").notNull(),
    transformation: jsonb("transformation"),
    obligatoire: boolean("obligatoire").notNull().default(false),
    valeur_par_defaut: text("valeur_par_defaut"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_mapping_export_format").on(t.format_export_id)],
);

// ─── salaire.export ──────────────────────────────────────────────────────────
export const exportSalaire = salaireSchema.table(
  "export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    format_export_id: uuid("format_export_id")
      .notNull()
      .references(() => formatExport.id, { onDelete: "restrict" }),
    logiciel_cible: logicielPaieCibleEnum("logiciel_cible"),
    fichier_id: uuid("fichier_id").references(() => document.id, { onDelete: "set null" }),
    nom_fichier: text("nom_fichier"),
    taille_octets: bigint("taille_octets", { mode: "number" }),
    nb_employes_inclus: integer("nb_employes_inclus"),
    nb_lignes_donnees: integer("nb_lignes_donnees"),
    genere_par: uuid("genere_par").notNull(),
    genere_le: timestamp("genere_le", { withTimezone: true }).notNull().defaultNow(),
    telecharge_le: timestamp("telecharge_le", { withTimezone: true }),
    import_confirme: boolean("import_confirme").notNull().default(false),
    import_confirme_le: timestamp("import_confirme_le", { withTimezone: true }),
    import_confirme_par: uuid("import_confirme_par"),
    import_notes: text("import_notes"),
    version_format: text("version_format"),
    statut: statutExportEnum("statut").notNull().default("genere"),
    message_erreur: text("message_erreur"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_export_periode").on(t.cabinet_id, t.periode_id)],
);

// ─── salaire.notification ─────────────────────────────────────────────────────
export const notificationSalaire = salaireSchema.table(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    type: typeNotificationEnum("type").notNull(),
    destinataire_contact_id: uuid("destinataire_contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    destinataire_email: text("destinataire_email"),
    sujet: text("sujet"),
    corps: text("corps"),
    langue: langueNotifEnum("langue"),
    date_envoi: timestamp("date_envoi", { withTimezone: true }).notNull().defaultNow(),
    statut_envoi: statutEnvoiNotifEnum("statut_envoi"),
    envoyee_par: uuid("envoyee_par"),
    graph_message_id: text("graph_message_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_notification_periode").on(t.cabinet_id, t.periode_id)],
);

// ─── salaire.relance ──────────────────────────────────────────────────────────
export const relanceSalaire = salaireSchema.table(
  "relance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    destinataire_contact_id: uuid("destinataire_contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    sujet: text("sujet"),
    corps: text("corps"),
    date_envoi: timestamp("date_envoi", { withTimezone: true }).notNull().defaultNow(),
    envoyee_par: uuid("envoyee_par"),
    auto_generated: boolean("auto_generated").notNull().default(false),
    valide_par_humain: boolean("valide_par_humain").notNull().default(false),
    graph_message_id: text("graph_message_id"),
    // RUN6 usabilité — snooze persistant (migration 0055), symétrique à crm.relance.
    snoozed_until: timestamp("snoozed_until", { withTimezone: true }),
    snoozed_par: uuid("snoozed_par").references(() => cabinetMembre.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_relance_periode").on(t.cabinet_id, t.periode_id),
    index("idx_relance_salaire_snoozed_until").on(t.cabinet_id, t.snoozed_until),
  ],
);

// ─── salaire.piece ────────────────────────────────────────────────────────────
export const piece = salaireSchema.table(
  "piece",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    periode_id: uuid("periode_id")
      .notNull()
      .references(() => periode.id, { onDelete: "cascade" }),
    employe_id: uuid("employe_id").references(() => employe.id, { onDelete: "set null" }),
    type_libre: text("type_libre"),
    categorie: categoriePieceEnum("categorie"),
    document_id: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "restrict" }),
    source: sourcePieceEnum("source").notNull(),
    commentaire: text("commentaire"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_piece_periode").on(t.cabinet_id, t.periode_id, t.employe_id)],
);
