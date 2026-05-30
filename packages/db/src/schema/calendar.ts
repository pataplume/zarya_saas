import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, client, typeEcheanceEnum } from "./crm";

// Namespace Postgres calendar.* — moteur d'échéances & relances (module Calendar)
// Périmètre Run 2 (ADR 0011) : cœur génération & config —
//   - calendar.template_echeance : règles de génération récurrente (catalogue global + overrides cabinet)
//   - calendar.modele_relance    : formulation des relances Handlebars (catalogue global + overrides cabinet)
//   - calendar.cabinet_config    : paramètres calendrier par cabinet
//   - calendar.pause_client      : pauses de relance par client
// Différés (Run 7) : calendar.evenement_outlook + colonnes Outlook sur crm.echeance/relance,
// vues calendar.v_*, jobs pg_cron de génération/transition/escalade (runs ultérieurs).
export const calendarSchema = pgSchema("calendar");

// ─── Enums (types Postgres natifs) ───────────────────────────────────────────

export const frequenceEcheanceEnum = calendarSchema.enum("frequence_echeance", [
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
  "evenement",
]);

export const politiqueRelanceEnum = calendarSchema.enum("politique_relance", [
  "validation_humaine_systematique", // Mode A (défaut MVP, ADR 0011 §4-5)
  "auto_premiere_relance", // Mode B (Phase 2)
  "auto_complete", // Mode C (Phase 2)
]);

export const langueEnum = calendarSchema.enum("langue", ["fr", "de", "it"]);

// ─── calendar.template_echeance — Règles de génération récurrente ────────────
// Catalogue global ZARYA (cabinet_id NULL) + overrides par cabinet. Le type
// réutilise crm.type_echeance pour rester aligné avec crm.echeance.type.

export const templateEcheance = calendarSchema.table(
  "template_echeance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = template ZARYA global (catalogue), sinon override propre au cabinet.
    cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "restrict" }),
    nom: text("nom").notNull(),
    type_echeance: typeEcheanceEnum("type_echeance").notNull(),
    frequence: frequenceEcheanceEnum("frequence").notNull(),
    // ── Critères d'application ──
    service_requis: text("service_requis").array(),
    canton_specifique: text("canton_specifique").array(),
    regime_tva: text("regime_tva").array(),
    // ── Génération ──
    jour_du_mois: integer("jour_du_mois"),
    mois_dans_annee: integer("mois_dans_annee").array(),
    date_specifique: date("date_specifique"),
    delai_alerte_jours: integer("delai_alerte_jours").notNull().default(7),
    jours_entre_relances: integer("jours_entre_relances").notNull().default(3),
    max_relances_auto: integer("max_relances_auto").notNull().default(3),
    documents_requis_types: text("documents_requis_types").array(),
    // ── Métadonnées ──
    // Self-FK (override d'un template parent) — déclarée en SQL, uuid simple ici.
    herite_de_id: uuid("herite_de_id"),
    description: text("description"),
    actif: boolean("actif").notNull().default(true),
    // auth.users — pas de FK (Supabase gère auth.*)
    created_by: uuid("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_template_echeance_lookup").on(t.cabinet_id, t.type_echeance, t.actif),
    index("idx_template_echeance_herite").on(t.herite_de_id),
  ],
);

// ─── calendar.modele_relance — Formulation Handlebars des relances ───────────
// Catalogue global ZARYA (cabinet_id NULL) + overrides par cabinet. ~12 modèles
// seed = 4 contextes (réutilise crm.type_echeance) × 3 langues (ADR 0011 §3).
// Templates logic-less Handlebars (ADR 0011 §2) : objet + corps interpolés.

export const modeleRelance = calendarSchema.table(
  "modele_relance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL = modèle ZARYA global (catalogue), sinon override propre au cabinet.
    cabinet_id: uuid("cabinet_id").references(() => cabinet.id, { onDelete: "restrict" }),
    type_echeance: typeEcheanceEnum("type_echeance").notNull(),
    langue: langueEnum("langue").notNull(),
    nom: text("nom").notNull(),
    objet: text("objet").notNull(), // Handlebars : "Rappel — {{echeance_libelle}}"
    corps: text("corps").notNull(), // Handlebars
    numero_relance: integer("numero_relance"), // rang dans la série (1/2/3), optionnel
    actif: boolean("actif").notNull().default(true),
    created_by: uuid("created_by"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_modele_relance_lookup").on(t.cabinet_id, t.type_echeance, t.langue, t.actif)],
);

// ─── calendar.cabinet_config — Paramètres calendrier par cabinet ─────────────
// Une ligne par cabinet (PK = cabinet_id). Défauts alignés sur l'ADR 0011
// (pause 7 jours ouvrés §5, bulk 50/envoi + 30 mails/min §6, Mode A §4).
// Les champs de sync Outlook sont différés (Run 7).

export const calendarCabinetConfig = calendarSchema.table("cabinet_config", {
  cabinet_id: uuid("cabinet_id")
    .primaryKey()
    .references(() => cabinet.id, { onDelete: "restrict" }),
  politique_relance_defaut: politiqueRelanceEnum("politique_relance_defaut")
    .notNull()
    .default("validation_humaine_systematique"),
  politique_relance_par_type: jsonb("politique_relance_par_type"),
  delai_alerte_defaut_jours: integer("delai_alerte_defaut_jours").notNull().default(7),
  delais_par_type: jsonb("delais_par_type"),
  pause_apres_reponse_jours: integer("pause_apres_reponse_jours").notNull().default(7),
  pause_si_reunion_jours: integer("pause_si_reunion_jours").notNull().default(7),
  max_relances_avant_escalade: integer("max_relances_avant_escalade").notNull().default(3),
  bulk_max_par_envoi: integer("bulk_max_par_envoi").notNull().default(50),
  bulk_throttle_par_minute: integer("bulk_throttle_par_minute").notNull().default(30),
  fermetures_annuelles: jsonb("fermetures_annuelles"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── calendar.pause_client — Pauses de relance par client ────────────────────
// Posées par le cabinet (vacances client, surcharge ponctuelle). Le trigger de
// cohérence crm.fn_check_client_cabinet interdit un client d'un autre cabinet.

export const pauseClient = calendarSchema.table(
  "pause_client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    // auth.users (contact RH ou membre cabinet) — pas de FK.
    demande_par: uuid("demande_par"),
    date_debut: date("date_debut").notNull(),
    date_fin: date("date_fin").notNull(),
    motif: text("motif"),
    types_echeances_paused: text("types_echeances_paused").array(),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pause_client_lookup").on(t.cabinet_id, t.client_id, t.date_debut, t.date_fin)],
);
