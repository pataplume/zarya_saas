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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Namespace Postgres crm.*
export const crmSchema = pgSchema("crm");

// ─── Enums (types Postgres natifs) ───────────────────────────────────────────

export const cabinetStatutEnum = crmSchema.enum("cabinet_statut", ["actif", "suspendu", "archive"]);

export const planTarifaireEnum = crmSchema.enum("plan_tarifaire", ["starter", "pro", "enterprise"]);

// Politique d'auto-classement Doc (flow-a §4). `strict` = défaut MVP (tout en file de
// validation, seuils inactifs — ADR 0014) ; `hybride`/`aggressive` = opt-in cabinet.
export const politiqueClassementEnum = crmSchema.enum("politique_classement", [
  "strict",
  "hybride",
  "aggressive",
]);

export const roleMembreEnum = crmSchema.enum("role_membre", [
  "responsable",
  "gestionnaire_salaires",
  "collaborateur",
  "lecteur",
]);

export const statutSessionOnboardingFiduciaireEnum = crmSchema.enum(
  "statut_session_onboarding_fiduciaire",
  [
    "inscrit",
    "email_verifie",
    "etape_a_en_cours",
    "etape_a_terminee",
    "etape_b_en_cours",
    "etape_b_terminee",
    "etape_c_en_cours",
    "etape_c_terminee",
    "etape_d_en_cours",
    "etape_d_terminee",
    "etape_e_en_cours",
    "etape_e_terminee",
    "etape_f_en_cours",
    "etape_f_terminee",
    "etape_f_differee",
    "paiement_configure",
    "actif",
    "abandonne",
    "suspendu",
    "archive",
  ],
);

export const statutInvitationMembreEnum = crmSchema.enum("statut_invitation_membre", [
  "envoyee",
  "lue",
  "acceptee",
  "expiree",
  "refusee",
  "annulee",
]);

export const statutClientEnum = crmSchema.enum("statut_client", [
  "prospect",
  "actif",
  "inactif",
  "archive",
]);

// ── Enrichissement crm.client (Bloc A1, ADR 0012) ────────────────────────────
// Nature du client. Conditionne le parcours métier (un indépendant n'a pas les
// mêmes obligations qu'une PME, un privé n'a pas de salaires, etc.).
export const clientTypeEnum = crmSchema.enum("client_type", [
  "pme",
  "independant",
  "prive",
  "association",
]);

// Langue de correspondance du client. Enum propre à crm (foncier) ; distinct de
// calendar.langue (fr/de/it) car le client peut correspondre en anglais.
export const langueClientEnum = crmSchema.enum("langue", ["fr", "de", "it", "en"]);

// Canal de communication préféré pour les relances et notifications.
export const canalPrefereEnum = crmSchema.enum("canal_prefere", [
  "email",
  "courrier",
  "telephone",
  "dashboard",
]);

// ── Bloc A2 (ADR 0012) — contacts & adresses du client ───────────────────────
// Type d'adresse d'un client. `siege` = adresse légale (RC) ; `facturation` =
// destinataire des factures ; `postale` = courrier opérationnel.
export const typeAdresseEnum = crmSchema.enum("type_adresse", ["postale", "facturation", "siege"]);

// ── Bloc A3 (ADR 0012) — services & paramétrage comptable du client ──────────
// Prestations souscrites par un client auprès du cabinet. Conditionne les
// échéances générées, les modules actifs, la facturation.
export const typeServiceEnum = crmSchema.enum("type_service", [
  "comptabilite",
  "fiscalite",
  "salaires",
  "tva",
  "bouclement",
  "conseil",
]);

// Cadence d'un service (distincte de calendar.frequence_echeance : un service peut
// être semestriel ou ponctuel, ce que le calendrier d'échéances ne couvre pas).
export const frequenceServiceEnum = crmSchema.enum("frequence_service", [
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
]);

// Logiciel comptable utilisé par le client (pour la reprise/synchro des données).
export const logicielComptableEnum = crmSchema.enum("logiciel_comptable", [
  "bexio",
  "abacus",
  "cresus",
  "winbiz",
  "banana",
  "excel",
  "officemaker",
  "autre",
]);

// Mode de transmission des pièces comptables du client vers le cabinet.
export const modeTransmissionEnum = crmSchema.enum("mode_transmission", [
  "email",
  "nas_partage",
  "connecteur_logiciel",
  "physique",
]);

// ── Bloc A4 — crm.document_attendu (enums) ───────────────────────────────────

export const categorieDocAttenduEnum = crmSchema.enum("categorie_doc_attendu", [
  "bancaire",
  "fiscal",
  "salaire",
  "commercial",
  "administratif",
]);

export const statutPeriodeDocEnum = crmSchema.enum("statut_periode_doc", [
  "recu",
  "manquant",
  "en_retard",
  "non_applicable",
]);

// ── Bloc A5 — crm.relation (§8) & crm.mandat (§9) ────────────────────────────

// Modèle d'honoraires de la relation contractuelle cabinet ↔ client.
export const honorairesModeleEnum = crmSchema.enum("honoraires_modele", [
  "forfait",
  "regie",
  "mixte",
]);

// Cycle de vie d'un mandat (relation contractuelle versionnée).
export const statutMandatEnum = crmSchema.enum("statut_mandat", ["actif", "expire", "resilie"]);

// ── Bloc A6 — crm.banque (§12) ───────────────────────────────────────────────

// Usage d'un compte bancaire d'un client (un client peut avoir plusieurs comptes :
// principal, secondaire, dédié à la paie, dédié à la TVA).
export const usageBanqueEnum = crmSchema.enum("usage_banque", [
  "principal",
  "secondaire",
  "paie",
  "tva",
]);

// ── Bloc A7 — crm.salaire_config (§14) ───────────────────────────────────────

// Fréquence de paie du client (config salaires). Distinct de frequence_service :
// la paie a sa propre cadence (quinzomadaire / hebdomadaire) hors du référentiel
// des services comptables.
export const frequencePaieEnum = crmSchema.enum("frequence_paie", [
  "mensuelle",
  "quinzomadaire",
  "hebdomadaire",
]);

// Logiciel de paie utilisé par le client (référentiel distinct du logiciel
// comptable : un client peut tenir sa compta sur bexio et ses salaires sur Swissdec).
export const logicielPaieEnum = crmSchema.enum("logiciel_paie", [
  "bexio_payroll",
  "cresus_salaires",
  "winbiz_salaires",
  "abacus_lohn",
  "officemaker_staff",
  "swissdec",
  "autre",
  "aucun",
]);

// ── Bloc A8 — crm.risque (§17), crm.evenement (§18), crm.note (§19) ──────────

// Niveau de risque d'un client (synthèse du score 0-100).
export const niveauRisqueEnum = crmSchema.enum("niveau_risque", ["ok", "surveillance", "critique"]);

// Type d'événement du journal client/cabinet (append-only). Liste extensible :
// on pose les types connus du MVP (crm-schema.md §18).
export const typeEvenementEnum = crmSchema.enum("type_evenement", [
  "document_recu",
  "document_classe",
  "relance_envoyee",
  "echeance_creee",
  "service_active",
  "note_ajoutee",
  "mandat_signe",
  "anomalie_facture",
  "score_recalcule",
  "cabinet_membre_ajoute",
  "integration_configuree",
]);

// Nature de l'acteur à l'origine d'un événement.
export const acteurTypeEvenementEnum = crmSchema.enum("acteur_type_evenement", [
  "cabinet_membre",
  "client_contact",
  "systeme",
  "ia",
]);

// Visibilité d'une note client au sein du cabinet.
export const visibiliteNoteEnum = crmSchema.enum("visibilite_note", [
  "cabinet",
  "responsable_seul",
]);

// ── Module Calendar (Run 1) — échéances & relances ───────────────────────────
// Périmètre Run 1 (ADR 0011) : tables opérationnelles de base crm.echeance et
// crm.relance. Le découpage canonique des runs est figé dans l'addendum
// 2026-05-30 de l'ADR 0011 (toute numérotation antérieure est caduque). Différés :
// rendu Handlebars (Run 5), génération auto (Run 6), pipeline d'envoi email
// (Run 7), sync Outlook (Run 8).

export const typeEcheanceEnum = crmSchema.enum("type_echeance", [
  "fiscale",
  "tva",
  "bouclement",
  "salaire",
  "relance_documents",
  "personnalisee",
]);

export const statutEcheanceEnum = crmSchema.enum("statut_echeance", [
  "a_venir",
  "imminente",
  "en_retard",
  "traitee",
  "reportee",
  "annulee",
]);

export const canalRelanceEnum = crmSchema.enum("canal_relance", [
  "email",
  "telephone",
  "sms",
  "dashboard",
]);

export const statutRelanceEnum = crmSchema.enum("statut_relance", [
  "brouillon",
  "envoyee",
  "lue",
  "repondue",
  "sans_reponse",
]);

// Bloc D1 — intégrations tierces (Microsoft Graph ; bexio/nas à venir).
export const integrationProviderEnum = crmSchema.enum("integration_provider", ["microsoft_graph"]);
export const integrationStatutEnum = crmSchema.enum("integration_statut", [
  "en_attente",
  "actif",
  "revoque",
  "erreur",
]);

// ─── crm.cabinet — Racine du tenant (pas de cabinet_id) ──────────────────────

export const cabinet = crmSchema.table(
  "cabinet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Référence auth.users(id) — pas de FK explicite (Supabase gère auth.*)
    created_by: uuid("created_by"),
    raison_sociale: text("raison_sociale").notNull(),
    ide: text("ide"), // CHE-XXX.XXX.XXX (UID suisse)
    email_contact: text("email_contact"),
    statut: cabinetStatutEnum("statut").notNull().default("actif"),
    plan_tarifaire: planTarifaireEnum("plan_tarifaire").notNull().default("starter"),
    onboarding_termine: boolean("onboarding_termine").notNull().default(false),
    onboarding_termine_at: timestamp("onboarding_termine_at", { withTimezone: true }),
    // Auto-classement Doc (flow-a §4) — défaut `strict` = comportement MVP inchangé.
    politique_classement: politiqueClassementEnum("politique_classement")
      .notNull()
      .default("strict"),

    // ── Identité enrichie (remplie à l'étape A) ─────────────────────────────
    zefix_ehraid: text("zefix_ehraid"),
    forme_juridique: text("forme_juridique"),
    adresse_rue: text("adresse_rue"),
    adresse_npa: text("adresse_npa"),
    adresse_ville: text("adresse_ville"),
    adresse_canton: text("adresse_canton"),
    date_inscription_rc: timestamp("date_inscription_rc", { withTimezone: true }),
    capital_social: text("capital_social"), // text pour éviter les pb de précision
    capital_devise: text("capital_devise").default("CHF"),
    but_statutaire: text("but_statutaire"),
    tva_numero: text("tva_numero"),

    // ── Préférences (remplies à l'étape A) ──────────────────────────────────
    langues_operationnelles: text("langues_operationnelles").array(),
    langue_principale: text("langue_principale").default("fr"),
    fuseau_horaire: text("fuseau_horaire").notNull().default("Europe/Zurich"),
    devise: text("devise").notNull().default("CHF"),
    site_web: text("site_web"),
    telephone: text("telephone"),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cabinet_statut").on(t.statut),
    index("idx_cabinet_created_by").on(t.created_by),
  ],
);

// ─── crm.cabinet_membre — Membres du cabinet (cabinet_id obligatoire) ────────

export const cabinetMembre = crmSchema.table(
  "cabinet_membre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    // Référence auth.users(id) — pas de FK explicite car Supabase gère auth.*
    user_id: uuid("user_id").notNull(),
    role: roleMembreEnum("role").notNull(),
    prenom: text("prenom"),
    nom: text("nom"),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_cabinet_membre_cabinet").on(t.cabinet_id),
    index("idx_cabinet_membre_user").on(t.user_id),
    unique("uniq_user_cabinet").on(t.user_id, t.cabinet_id),
  ],
);

// ─── crm.client — Clients (PME) gérés par le cabinet ─────────────────────────
// Fondation CRM v1.0 (Bloc A1, ADR 0012 + crm-schema.md §5). Le schéma client est
// le contrat sur lequel s'appuient Doc, Calendar, Facture, Salaire : on le pose
// complet une fois, on ne le « reshape » plus.
//
// Divergences ASSUMÉES vs crm-schema.md §5 (documentées, non oublis) :
//  - `statut` garde son DEFAULT historique 'actif' (et non 'prospect' du doc cible)
//    pour ne pas changer le comportement du flux clients/onboarding existant ;
//  - `onboarding_session_id` / `onboarding_termine` sont DIFFÉRÉS au Bloc F : la
//    table `onboarding_client.session` n'existe pas encore (anti-FK-fantôme).

export const client = crmSchema.table(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    type: clientTypeEnum("type").notNull().default("pme"),
    raison_sociale: text("raison_sociale").notNull(),
    nom_court: text("nom_court"), // Alias d'affichage UI + rattachement Doc
    ide: text("ide"), // CHE-XXX.XXX.XXX
    numero_tva: text("numero_tva"),
    forme_juridique: text("forme_juridique"), // SA, Sàrl, raison individuelle…
    langue: langueClientEnum("langue").notNull().default("fr"),
    canal_prefere: canalPrefereEnum("canal_prefere").notNull().default("email"),
    statut: statutClientEnum("statut").notNull().default("actif"),
    // Collaborateur référent dans le cabinet. Cohérence cabinet garantie par
    // trigger trg_check_responsable_cabinet_client (cf. migration 0009).
    responsable_id: uuid("responsable_id").references(() => cabinetMembre.id, {
      onDelete: "set null",
    }),
    date_creation: date("date_creation").notNull().default(sql`CURRENT_DATE`),
    date_debut_relation: date("date_debut_relation"),
    date_fin_relation: date("date_fin_relation"),
    source_acquisition: text("source_acquisition"),
    tags: text("tags").array(),
    notes_commerciales: text("notes_commerciales"),
    email_contact: text("email_contact"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_client_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_client_cabinet_statut").on(t.cabinet_id, t.statut),
    index("idx_client_cabinet_responsable").on(t.cabinet_id, t.responsable_id),
    // Recherche par nom (autocomplete, barre de recherche) — GIN trigram.
    index("idx_client_raison_trgm").using("gin", sql`${t.raison_sociale} gin_trgm_ops`),
    unique("uniq_client_ide_per_cabinet").on(t.cabinet_id, t.ide),
  ],
);

// ─── crm.contact — Personnes de contact d'un client (Bloc A2, ADR 0012) ──────
// Interlocuteurs d'un client (dirigeant, comptable, RH, signataire…). cabinet_id
// est dénormalisé pour la RLS ; sa cohérence avec client.cabinet_id est garantie
// par le trigger trg_check_client_cabinet_contact (migration 0010). Au plus un
// contact `est_principal` par client (index unique partiel uniq_contact_principal).
// `langue` NULL ⇒ on hérite de la langue du client (résolu côté applicatif).

export const contact = crmSchema.table(
  "contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    prenom: text("prenom"),
    nom: text("nom").notNull(),
    role: text("role"), // "Dirigeant", "Comptable", "RH"… (texte libre)
    est_principal: boolean("est_principal").notNull().default(false),
    est_contact_rh: boolean("est_contact_rh").notNull().default(false),
    est_signataire: boolean("est_signataire").notNull().default(false),
    email: text("email"),
    telephone: text("telephone"),
    langue: langueClientEnum("langue"), // NULL ⇒ hérite du client
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_contact_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_contact_client").on(t.cabinet_id, t.client_id),
    // Au plus 1 contact principal par client (les contacts archivés ne comptent pas).
    uniqueIndex("uniq_contact_principal_per_client")
      .on(t.client_id)
      .where(sql`${t.est_principal} AND ${t.archived_at} IS NULL`),
  ],
);

// ─── crm.adresse — Adresses d'un client (Bloc A2, ADR 0012) ──────────────────
// Adresses postale / facturation / siège d'un client. cabinet_id dénormalisé pour
// la RLS, cohérence garantie par trg_check_client_cabinet_adresse (migration 0010).
// Au plus une adresse `est_principale` par client (index unique partiel).
// NB vs crm-schema.md §7 : on ajoute created_at/updated_at/archived_at (convention
// db/CLAUDE.md §2 — toute table métier porte ces timestamps) — divergence assumée.

export const adresse = crmSchema.table(
  "adresse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    type: typeAdresseEnum("type").notNull(),
    rue: text("rue"),
    complement: text("complement"),
    code_postal: text("code_postal"),
    ville: text("ville"),
    canton: text("canton"), // canton suisse (ex. "VD", "GE") — au niveau adresse
    pays: text("pays").notNull().default("CH"), // ISO 3166-1 alpha-2
    est_principale: boolean("est_principale").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_adresse_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_adresse_client").on(t.cabinet_id, t.client_id),
    // Au plus 1 adresse principale par client (les adresses archivées ne comptent pas).
    uniqueIndex("uniq_adresse_principale_per_client")
      .on(t.client_id)
      .where(sql`${t.est_principale} AND ${t.archived_at} IS NULL`),
  ],
);

// ─── crm.service — Prestations souscrites par un client (Bloc A3, ADR 0012) ──
// cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_service (migration 0011). `parametres` jsonb : config
// libre par service (ex. taux TVA, jour de paie…). Au plus un service ACTIF de
// chaque type par client (index unique partiel — historisation possible après
// désactivation). Divergence assumée vs crm-schema.md §10 qui écrit UNIQUE(client_id,
// type) « strict » : on choisit le partiel pour coller à l'intention « au plus une
// instance ACTIVE » et permettre l'historique sans reshaper le contrat.

export const service = crmSchema.table(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    type: typeServiceEnum("type").notNull(),
    actif: boolean("actif").notNull().default(true),
    date_activation: date("date_activation").notNull().default(sql`CURRENT_DATE`),
    date_desactivation: date("date_desactivation"),
    frequence: frequenceServiceEnum("frequence"),
    parametres: jsonb("parametres"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_service_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_service_client").on(t.cabinet_id, t.client_id),
    // Au plus 1 service actif de chaque type par client (archivés exclus).
    uniqueIndex("uniq_service_actif_per_client_type")
      .on(t.client_id, t.type)
      .where(sql`${t.actif} AND ${t.archived_at} IS NULL`),
  ],
);

// ─── crm.param_comptable — Paramétrage comptable du client (Bloc A3) ─────────
// 1-1 avec le client (client_id = PK). cabinet_id dénormalisé pour la RLS,
// cohérence garantie par trg_check_client_cabinet_param_comptable (migration 0011).
//
// ⚠️ SÉCURITÉ : `acces_logiciel_externe` contient des credentials d'accès au
// logiciel comptable du client → champ ULTRA-SENSIBLE. Tout écriture DOIT chiffrer
// le contenu via Supabase Vault (cf. CLAUDE.md §2). Aucun chemin d'écriture n'existe
// encore (table de contrat) ; l'enforcement du chiffrement est porté par la feature
// qui peuplera cette colonne (Bloc ultérieur), pas par ce run de schéma.

export const paramComptable = crmSchema.table(
  "param_comptable",
  {
    client_id: uuid("client_id")
      .primaryKey()
      .references(() => client.id, { onDelete: "restrict" }),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    logiciel: logicielComptableEnum("logiciel"),
    logiciel_autre: text("logiciel_autre"),
    plan_comptable: text("plan_comptable"),
    date_debut_exercice: date("date_debut_exercice"),
    date_bouclement: date("date_bouclement"),
    mode_transmission: modeTransmissionEnum("mode_transmission"),
    // Chiffré via Vault à l'écriture (voir avertissement ci-dessus).
    acces_logiciel_externe: jsonb("acces_logiciel_externe"),
    derniere_synchronisation: timestamp("derniere_synchronisation", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_param_comptable_cabinet").on(t.cabinet_id)],
);

// ─── crm.document_attendu — Documents périodiques attendus d'un client (Bloc A4)
// crm-schema.md § 13. cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_document_attendu (migration 0012). service_id est une
// vraie FK vers crm.service (existe depuis A3). `frequence` réutilise l'enum
// frequence_service (valeurs identiques — divergence assumée : pas de doublon).

export const documentAttendu = crmSchema.table(
  "document_attendu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    service_id: uuid("service_id").references(() => service.id, { onDelete: "set null" }),
    type_document: text("type_document").notNull(),
    categorie: categorieDocAttenduEnum("categorie"),
    frequence: frequenceServiceEnum("frequence").notNull(),
    obligatoire: boolean("obligatoire").notNull().default(true),
    deadline_jours_apres_periode: integer("deadline_jours_apres_periode"),
    derniere_reception: date("derniere_reception"),
    derniere_periode_recue: text("derniere_periode_recue"),
    statut_periode_courante: statutPeriodeDocEnum("statut_periode_courante"),
    non_applicable_motif: text("non_applicable_motif"),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_document_attendu_statut").on(t.cabinet_id, t.client_id, t.statut_periode_courante),
    index("idx_document_attendu_reception").on(t.derniere_reception),
  ],
);

// ─── crm.relation — Relation contractuelle cabinet ↔ client (Bloc A5) ────────
// crm-schema.md § 8. 1-1 avec le client (client_id = PK). cabinet_id dénormalisé
// pour la RLS, cohérence garantie par trg_check_client_cabinet_relation (0013).
//
// ⚠️ SÉCURITÉ : `iban_facturation` est un IBAN → champ SENSIBLE (CLAUDE.md §2).
// Tout chemin d'écriture DOIT chiffrer via Supabase Vault. Aucun n'existe encore
// (table de contrat) ; l'enforcement est porté par la feature qui peuplera la
// colonne, pas par ce run de schéma.

export const relation = crmSchema.table(
  "relation",
  {
    client_id: uuid("client_id")
      .primaryKey()
      .references(() => client.id, { onDelete: "restrict" }),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    pack_tarifaire: text("pack_tarifaire"),
    honoraires_mensuels: numeric("honoraires_mensuels", { precision: 10, scale: 2 }),
    honoraires_modele: honorairesModeleEnum("honoraires_modele"),
    date_signature: date("date_signature"),
    date_renouvellement: date("date_renouvellement"),
    duree_engagement_mois: integer("duree_engagement_mois"),
    notes_facturation: text("notes_facturation"),
    // Chiffré via Vault à l'écriture (voir avertissement ci-dessus).
    iban_facturation: text("iban_facturation"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_relation_cabinet").on(t.cabinet_id)],
);

// ─── crm.mandat — Mandat contractuel versionné cabinet ↔ client (Bloc A5) ────
// crm-schema.md § 9. cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_mandat (0013). `document_id` référence doc.document :
// FK déclarée en SQL (migration 0013) et non côté Drizzle pour éviter l'import
// circulaire crm ↔ doc (doc importe déjà crm.client / crm.cabinet).

export const mandat = crmSchema.table(
  "mandat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    date_signature: date("date_signature").notNull(),
    date_effet: date("date_effet").notNull(),
    date_fin: date("date_fin"),
    // FK → doc.document déclarée en SQL (0013) — voir note ci-dessus.
    document_id: uuid("document_id"),
    services_couverts: text("services_couverts").array(),
    signataires: jsonb("signataires"),
    statut: statutMandatEnum("statut").notNull().default("actif"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_mandat_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_mandat_client").on(t.cabinet_id, t.client_id),
  ],
);

// ─── crm.banque — Comptes bancaires d'un client (Bloc A6) ────────────────────
// crm-schema.md § 12. cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_banque (migration 0014). Un client peut avoir plusieurs
// comptes (usage principal / secondaire / paie / tva).
//
// ⚠️ SÉCURITÉ — champs ULTRA-SENSIBLES (CLAUDE.md §2, ADR 0013) :
//  - `iban` (NOT NULL) : IBAN du client → chiffrement au repos OBLIGATOIRE.
//  - `credentials_open_banking` : secrets d'accès Open Banking (intégration future).
// Tout chemin d'écriture DOIT chiffrer ces colonnes (Vault / pgsodium / AEAD appli —
// décision tranchée à l'ADR 0013). Aucun chemin d'écriture n'existe encore (table de
// contrat) ; l'enforcement est porté par la feature qui peuplera ces colonnes, pas
// par ce run de schéma. Voir COMMENT ON COLUMN dans la migration 0014 + ADR 0013.

export const banque = crmSchema.table(
  "banque",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    nom_banque: text("nom_banque"),
    // Chiffré au repos (voir avertissement ci-dessus, ADR 0013).
    iban: text("iban").notNull(),
    bic: text("bic"),
    devise: text("devise").notNull().default("CHF"),
    usage: usageBanqueEnum("usage"),
    actif: boolean("actif").notNull().default(true),
    // Chiffré au repos (voir avertissement ci-dessus, ADR 0013).
    credentials_open_banking: jsonb("credentials_open_banking"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_banque_cabinet").on(t.cabinet_id, t.archived_at),
    index("idx_banque_client").on(t.cabinet_id, t.client_id),
  ],
);

// ─── crm.salaire_config — Paramétrage salaires d'un client (Bloc A7) ─────────
// crm-schema.md § 14. 1-1 avec le client (client_id = PK), rempli si le service
// salaires est actif. cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_salaire_config (migration 0015). `contact_rh_id` est une
// vraie FK vers crm.contact (existe depuis A2) ; sa cohérence cabinet est garantie
// applicativement (le contact appartient au même client, donc au même cabinet) et
// vérifiée en test.

export const salaireConfig = crmSchema.table(
  "salaire_config",
  {
    client_id: uuid("client_id")
      .primaryKey()
      .references(() => client.id, { onDelete: "restrict" }),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    nombre_employes: integer("nombre_employes"),
    frequence_paie: frequencePaieEnum("frequence_paie").notNull().default("mensuelle"),
    date_validation_jour_du_mois: integer("date_validation_jour_du_mois"),
    contact_rh_id: uuid("contact_rh_id").references(() => contact.id, { onDelete: "set null" }),
    logiciel_paie: logicielPaieEnum("logiciel_paie"),
    caisse_avs: text("caisse_avs"),
    caisse_lpp: text("caisse_lpp"),
    assurance_accidents: text("assurance_accidents"),
    assurance_ijm: text("assurance_ijm"),
    documents_attendus_par_periode: jsonb("documents_attendus_par_periode"),
    envoi_automatique_relance: boolean("envoi_automatique_relance").notNull().default(false),
    derniere_validation_recue: date("derniere_validation_recue"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_salaire_config_cabinet").on(t.cabinet_id),
    index("idx_salaire_config_contact_rh").on(t.contact_rh_id),
  ],
);

// ─── crm.risque — Score de risque d'un client (Bloc A8) ──────────────────────
// crm-schema.md § 17. 1-1 avec le client (client_id = PK). cabinet_id dénormalisé
// pour la RLS, cohérence garantie par trg_check_client_cabinet_risque (0016).
// `score` 0-100 + `niveau` synthétique ; recalculés par une feature ultérieure.
// NB vs §17 : created_at/updated_at ajoutés (convention db/CLAUDE.md §2) — divergence
// assumée.

export const risque = crmSchema.table(
  "risque",
  {
    client_id: uuid("client_id")
      .primaryKey()
      .references(() => client.id, { onDelete: "restrict" }),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    score: integer("score").notNull().default(0),
    niveau: niveauRisqueEnum("niveau"),
    facteurs: jsonb("facteurs"),
    drapeau_critique: boolean("drapeau_critique").notNull().default(false),
    drapeau_motif: text("drapeau_motif"),
    derniere_activite: timestamp("derniere_activite", { withTimezone: true }),
    dernier_calcul: timestamp("dernier_calcul", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_risque_cabinet").on(t.cabinet_id, t.niveau)],
);

// ─── crm.evenement — Journal d'activité append-only (Bloc A8) ────────────────
// crm-schema.md § 18. cabinet_id dénormalisé pour la RLS ; `client_id` est NULLABLE
// (événement cabinet-level non rattaché à un client). Le trigger générique
// trg_check_client_cabinet_evenement (0016) tolère client_id NULL (fn_check_client_
// cabinet garde `IF NEW.client_id IS NOT NULL`).
//
// « Append-only » est une convention applicative (aucun chemin UPDATE/DELETE en prod) :
// la table reste physiquement mutable pour permettre le cleanup des tests. Pas d'archived_at
// (journal), pas d'updated_at (lignes immuables).

export const evenement = crmSchema.table(
  "evenement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    // NULLABLE : événement cabinet-level possible (pas lié à un client).
    client_id: uuid("client_id").references(() => client.id, { onDelete: "restrict" }),
    type: typeEvenementEnum("type").notNull(),
    acteur_type: acteurTypeEvenementEnum("acteur_type"),
    // Acteur : référence logique (cabinet_membre / contact / système) sans FK
    // (polymorphe selon acteur_type) — intégrité applicative.
    acteur_id: uuid("acteur_id"),
    ressource_type: text("ressource_type"),
    ressource_id: uuid("ressource_id"),
    description: text("description"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_evenement_client").on(t.cabinet_id, t.client_id, t.created_at),
    index("idx_evenement_type").on(t.cabinet_id, t.type),
  ],
);

// ─── crm.note — Notes internes du cabinet sur un client (Bloc A8) ─────────────
// crm-schema.md § 19. cabinet_id dénormalisé pour la RLS, cohérence garantie par
// trg_check_client_cabinet_note (0016). `auteur_id` = cabinet_membre (cohérence
// cabinet garantie applicativement, FK ON DELETE SET NULL). `contenu` Markdown.

export const note = crmSchema.table(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    auteur_id: uuid("auteur_id").references(() => cabinetMembre.id, { onDelete: "set null" }),
    contenu: text("contenu").notNull(),
    epingle: boolean("epingle").notNull().default(false),
    visibilite: visibiliteNoteEnum("visibilite").notNull().default("cabinet"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_note_client").on(t.cabinet_id, t.client_id, t.archived_at),
    index("idx_note_epingle")
      .on(t.cabinet_id, t.client_id)
      .where(sql`${t.epingle} AND ${t.archived_at} IS NULL`),
  ],
);

// ─── crm.cabinet_integration — Credentials d'intégration tierce (Bloc D1) ────
// docs/architecture/microsoft-integration.md §3.2. PAS de client_id (l'intégration
// appartient au cabinet). ⚠️ SÉCURITÉ (ADR 0013 addendum) : aucune colonne de token
// en clair. Les tokens OAuth vivent dans Supabase Vault ; seul `vault_secret_id` (UUID
// du secret) est stocké ici. `parametres` ne contient que du NON sensible (tenant_id,
// user_principal_name, tenant_region, expires_at, scope). Migration 0024.

export const cabinetIntegration = crmSchema.table(
  "cabinet_integration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    provider: integrationProviderEnum("provider").notNull(),
    vault_secret_id: uuid("vault_secret_id"),
    statut: integrationStatutEnum("statut").notNull().default("en_attente"),
    parametres: jsonb("parametres").notNull().default({}),
    derniere_erreur: text("derniere_erreur"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uniq_cabinet_integration_provider")
      .on(t.cabinet_id, t.provider)
      .where(sql`${t.archived_at} IS NULL`),
    index("idx_cabinet_integration_cabinet").on(t.cabinet_id, t.archived_at),
  ],
);

// ── Bloc A9 — Catalogues globaux crm.standard_* (§20) ────────────────────────
//
// EXCEPTION DOCUMENTÉE à la règle multi-tenant (packages/db/CLAUDE.md §1,
// crm-schema.md §20/§22.3) : tables de référence partagées par TOUS les cabinets,
// donc SANS `cabinet_id`, en LECTURE SEULE pour les cabinets. RLS DÉSACTIVÉE
// (lecture publique pour les rôles authentifiés) ; ces tables ne figurent donc PAS
// dans METIER_TABLES ni RLS_TABLES du test anti-fuite (elles n'ont pas de tenant à
// isoler). Données de seed permanentes, posées dans la migration 0017.
//
// Override par cabinet (§20.2) : différé — un cabinet voulant un type custom créera
// plus tard une crm.cabinet_type_document scopée ; la résolution fusionnera standards
// + custom. Hors périmètre A9 (fondation des catalogues globaux uniquement).

// Catégories standard de documents (aligné sur doc.categorie_document).
export const standardCategorieDocument = crmSchema.table("standard_categorie_document", {
  code: text("code").primaryKey(),
  libelle: text("libelle").notNull(),
  ordre: integer("ordre").notNull().default(0),
  actif: boolean("actif").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Types standard de documents ZARYA (slugs du vocabulaire de classification).
export const standardTypeDocument = crmSchema.table(
  "standard_type_document",
  {
    code: text("code").primaryKey(),
    libelle: text("libelle").notNull(),
    categorie_code: text("categorie_code")
      .notNull()
      .references(() => standardCategorieDocument.code, { onDelete: "restrict" }),
    ordre: integer("ordre").notNull().default(0),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_standard_type_document_categorie").on(t.categorie_code)],
);

// Cantons suisses (code à 2 lettres = PK ; noms multilingues FR/DE/IT).
export const standardCantonCh = crmSchema.table("standard_canton_ch", {
  code: text("code").primaryKey(),
  nom_fr: text("nom_fr").notNull(),
  nom_de: text("nom_de").notNull(),
  nom_it: text("nom_it"),
  numero: integer("numero").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Caisses de compensation AVS (référentiel officiel ahv-iv.ch). `code` = VRAI numéro
// de caisse officiel (ex. '1' canton ZH, '26.1' CFC, '27' CSC, '106.1' FER CIAM ;
// sous-numéros décimaux possibles → text). `type` ∈ {cantonale, federale,
// professionnelle}. `canton` rattache les 26 cantonales à crm.standard_canton_ch
// (NULL pour fédérales/professionnelles). Seed corrigé/enrichi en migration 0019.
export const standardCaisseAvs = crmSchema.table(
  "standard_caisse_avs",
  {
    code: text("code").primaryKey(),
    nom: text("nom").notNull(),
    type: text("type"),
    canton: text("canton").references(() => standardCantonCh.code, { onDelete: "restrict" }),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_standard_caisse_avs_canton").on(t.canton)],
);

// ─── crm.session_onboarding_fiduciaire — Suivi wizard d'onboarding ───────────

export const sessionOnboardingFiduciaire = crmSchema.table(
  "session_onboarding_fiduciaire",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .unique()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    statut: statutSessionOnboardingFiduciaireEnum("statut").notNull().default("inscrit"),
    date_inscription: timestamp("date_inscription", { withTimezone: true }).notNull().defaultNow(),
    date_verification_email: timestamp("date_verification_email", { withTimezone: true }),
    date_derniere_activite: timestamp("date_derniere_activite", { withTimezone: true })
      .notNull()
      .defaultNow(),
    date_completion: timestamp("date_completion", { withTimezone: true }),
    etape_a_terminee_at: timestamp("etape_a_terminee_at", { withTimezone: true }),
    etape_b_terminee_at: timestamp("etape_b_terminee_at", { withTimezone: true }),
    etape_c_terminee_at: timestamp("etape_c_terminee_at", { withTimezone: true }),
    etape_d_terminee_at: timestamp("etape_d_terminee_at", { withTimezone: true }),
    etape_e_terminee_at: timestamp("etape_e_terminee_at", { withTimezone: true }),
    etape_f_terminee_at: timestamp("etape_f_terminee_at", { withTimezone: true }),
    etape_f_differee_at: timestamp("etape_f_differee_at", { withTimezone: true }),
    consentement_cgu: boolean("consentement_cgu").notNull().default(false),
    consentement_cgu_at: timestamp("consentement_cgu_at", { withTimezone: true }),
    consentement_zefix: boolean("consentement_zefix").default(false),
    consentement_zefix_at: timestamp("consentement_zefix_at", { withTimezone: true }),
    plan_choisi: planTarifaireEnum("plan_choisi"),
    paiement_configure: boolean("paiement_configure").default(false),
    paiement_configure_at: timestamp("paiement_configure_at", { withTimezone: true }),
    date_fin_essai: timestamp("date_fin_essai", { withTimezone: true }),
    code_parrainage_utilise: text("code_parrainage_utilise"),
    utm_source: text("utm_source"),
    utm_campaign: text("utm_campaign"),
    utm_medium: text("utm_medium"),
    notes_csm: text("notes_csm"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_session_onboarding_statut").on(t.statut),
    index("idx_session_onboarding_activite").on(t.statut, t.date_derniere_activite),
  ],
);

// ─── crm.invitation_membre — Invitations équipe étape B ──────────────────────

export const invitationMembre = crmSchema.table(
  "invitation_membre",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    session_id: uuid("session_id").references(() => sessionOnboardingFiduciaire.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    prenom: text("prenom"),
    nom: text("nom"),
    role_propose: roleMembreEnum("role_propose").notNull(),
    specialisation: text("specialisation").array(),
    // Token interne pour suivi — l'invitation Supabase est distincte
    token: uuid("token").notNull().defaultRandom().unique(),
    token_expire_at: timestamp("token_expire_at", { withTimezone: true }).notNull(),
    statut: statutInvitationMembreEnum("statut").notNull().default("envoyee"),
    date_envoi: timestamp("date_envoi", { withTimezone: true }).notNull().defaultNow(),
    date_lecture: timestamp("date_lecture", { withTimezone: true }),
    date_acceptation: timestamp("date_acceptation", { withTimezone: true }),
    date_refus: timestamp("date_refus", { withTimezone: true }),
    // Référence auth.users — pas de FK (Supabase gère auth.*)
    envoyee_par: uuid("envoyee_par"),
    cabinet_membre_id: uuid("cabinet_membre_id").references(() => cabinetMembre.id, {
      onDelete: "set null",
    }),
    relance_count: text("relance_count").default("0"),
    derniere_relance_at: timestamp("derniere_relance_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_invitation_membre_cabinet").on(t.cabinet_id, t.statut),
    index("idx_invitation_membre_email").on(t.email),
    index("idx_invitation_membre_token").on(t.token),
  ],
);

// ─── crm.zefix_recherche_cabinet — Audit des appels Zefix (nLPD) ─────────────

export const zefixRechercheCabinet = crmSchema.table(
  "zefix_recherche_cabinet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    session_id: uuid("session_id").references(() => sessionOnboardingFiduciaire.id, {
      onDelete: "set null",
    }),
    // Nullable : cabinet peut ne pas être encore créé au moment de la recherche
    cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "set null" }),
    requete: text("requete").notNull(),
    nb_resultats: text("nb_resultats"),
    ide_selectionne: text("ide_selectionne"),
    reponse_brute: text("reponse_brute"), // JSON stringify pour éviter import jsonb
    consentement_donne: boolean("consentement_donne").notNull(),
    date_appel: timestamp("date_appel", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_zefix_recherche_cabinet").on(t.cabinet_id),
    index("idx_zefix_recherche_session").on(t.session_id),
  ],
);

// ─── crm.echeance — Échéances fiscales/sociales par client ───────────────────
// Colonnes de base (crm-schema.md § 15). Les extensions Outlook / escalade /
// pause (echeance-schema.md § 4) sont différées à leurs runs respectifs.

export const echeance = crmSchema.table(
  "echeance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    // FK reconnectée en A4 : crm.service existe depuis A3.
    service_id: uuid("service_id").references(() => service.id, { onDelete: "set null" }),
    // calendar.template_echeance différé (Run 2) — uuid simple sans FK.
    template_id: uuid("template_id"),
    type: typeEcheanceEnum("type").notNull(),
    libelle: text("libelle").notNull(),
    date_echeance: date("date_echeance").notNull(),
    date_alerte: date("date_alerte"),
    statut: statutEcheanceEnum("statut").notNull().default("a_venir"),
    date_traitement: date("date_traitement"),
    reporte_a: date("reporte_a"),
    motif_report: text("motif_report"),
    // uuid[] de crm.document_attendu : pas de FK possible sur un tableau Postgres
    // (intégrité applicative). Le type cible existe depuis A4.
    documents_requis: uuid("documents_requis").array(),
    created_by: uuid("created_by").references(() => cabinetMembre.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_echeance_client").on(t.cabinet_id, t.client_id, t.date_echeance),
    index("idx_echeance_statut").on(t.cabinet_id, t.statut, t.date_echeance),
  ],
);

// ─── crm.relance — Relances clients liées à une échéance / un document ───────
// Colonnes de base (crm-schema.md § 16). Le rendu Handlebars (Run 5) puis le
// pipeline d'envoi (validation Mode A, Microsoft Graph — Run 7) sont différés.
// Découpage canonique : addendum 2026-05-30 de l'ADR 0011.

export const relance = crmSchema.table(
  "relance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    echeance_id: uuid("echeance_id").references(() => echeance.id, { onDelete: "set null" }),
    // FK reconnectée en A4 : crm.document_attendu existe depuis A4.
    document_attendu_id: uuid("document_attendu_id").references(() => documentAttendu.id, {
      onDelete: "set null",
    }),
    canal: canalRelanceEnum("canal").notNull().default("email"),
    // FK reconnectée en A4 : crm.contact existe depuis A2.
    destinataire_contact_id: uuid("destinataire_contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    date_envoi: timestamp("date_envoi", { withTimezone: true }),
    sujet: text("sujet"),
    corps: text("corps"),
    statut: statutRelanceEnum("statut").notNull().default("brouillon"),
    reponse_recue_le: timestamp("reponse_recue_le", { withTimezone: true }),
    validee_par: uuid("validee_par").references(() => cabinetMembre.id, { onDelete: "set null" }),
    numero_dans_serie: integer("numero_dans_serie"),
    // Bloc C2b — tracking de l'envoi Microsoft (ADR 0019, exception additive au sceau A).
    microsoft_message_id: text("microsoft_message_id"),
    internet_message_id: text("internet_message_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_relance_echeance").on(t.echeance_id),
    index("idx_relance_client").on(t.cabinet_id, t.client_id),
    index("idx_relance_statut").on(t.cabinet_id, t.statut),
  ],
);

// ════════════════════════════════════════════════════════════════════════════
// Bloc A10 — Vues de lecture crm.v_* (§21). Clôture de la fondation CRM (ADR 0012).
// ════════════════════════════════════════════════════════════════════════════
// Définies en DB par la migration 0018 (security_invoker = true). Déclarées ici en
// `.existing()` : Drizzle n'en gère PAS le DDL, il ne fait qu'exposer un type de
// lecture pour le query-builder. Les vues exposent `cabinet_id` → le consommateur
// applicatif DOIT filtrer `WHERE cabinet_id = X` (la frontière de sécurité réelle
// sur le chemin service-role, cf. ADR 0005 addendum). Enums typés en `text` côté
// vue (lecture seule, pas de contrainte d'écriture).

// crm.v_client_dashboard — listing dénormalisé (client + risque + agrégats).
export const vClientDashboard = crmSchema
  .view("v_client_dashboard", {
    id: uuid("id"),
    cabinet_id: uuid("cabinet_id"),
    raison_sociale: text("raison_sociale"),
    type: text("type"),
    statut: text("statut"),
    langue: text("langue"),
    risque_score: integer("risque_score"),
    risque_niveau: text("risque_niveau"),
    prochaine_echeance: date("prochaine_echeance"),
    nb_documents_manquants: bigint("nb_documents_manquants", { mode: "number" }),
    derniere_activite: timestamp("derniere_activite", { withTimezone: true }),
  })
  .existing();

// crm.v_echeances_a_venir — échéances ouvertes des 30 prochains jours.
export const vEcheancesAVenir = crmSchema
  .view("v_echeances_a_venir", {
    id: uuid("id"),
    cabinet_id: uuid("cabinet_id"),
    client_id: uuid("client_id"),
    raison_sociale: text("raison_sociale"),
    type: text("type"),
    libelle: text("libelle"),
    date_echeance: date("date_echeance"),
    date_alerte: date("date_alerte"),
    statut: text("statut"),
  })
  .existing();

// crm.v_documents_manquants — documents manquants ou en retard, par cabinet.
export const vDocumentsManquants = crmSchema
  .view("v_documents_manquants", {
    id: uuid("id"),
    cabinet_id: uuid("cabinet_id"),
    client_id: uuid("client_id"),
    raison_sociale: text("raison_sociale"),
    type_document: text("type_document"),
    categorie: text("categorie"),
    frequence: text("frequence"),
    statut_periode_courante: text("statut_periode_courante"),
    derniere_periode_recue: text("derniere_periode_recue"),
  })
  .existing();
