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
import { cabinet, client, contact } from "./crm";
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
