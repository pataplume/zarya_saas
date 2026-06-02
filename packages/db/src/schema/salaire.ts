import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, client, contact } from "./crm";

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
