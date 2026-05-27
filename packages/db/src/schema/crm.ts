import { boolean, index, pgSchema, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
