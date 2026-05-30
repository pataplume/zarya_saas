import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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
    // crm.service différé (CRM étendu, Phase 4+) — uuid simple sans FK.
    service_id: uuid("service_id"),
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
    // crm.document_attendu différé (CRM étendu, Phase 4+) — uuid[] sans FK.
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
    // crm.document_attendu différé (CRM étendu, Phase 4+) — uuid simple sans FK.
    document_attendu_id: uuid("document_attendu_id"),
    canal: canalRelanceEnum("canal").notNull().default("email"),
    // crm.contact différé (CRM étendu, Phase 4+) — uuid simple sans FK.
    destinataire_contact_id: uuid("destinataire_contact_id"),
    date_envoi: timestamp("date_envoi", { withTimezone: true }),
    sujet: text("sujet"),
    corps: text("corps"),
    statut: statutRelanceEnum("statut").notNull().default("brouillon"),
    reponse_recue_le: timestamp("reponse_recue_le", { withTimezone: true }),
    validee_par: uuid("validee_par").references(() => cabinetMembre.id, { onDelete: "set null" }),
    numero_dans_serie: integer("numero_dans_serie"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_relance_echeance").on(t.echeance_id),
    index("idx_relance_client").on(t.cabinet_id, t.client_id),
    index("idx_relance_statut").on(t.cabinet_id, t.statut),
  ],
);
