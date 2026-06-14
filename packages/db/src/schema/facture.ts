import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, client } from "./crm";
import { document } from "./doc";
import { invocation } from "./extraction";

// Namespace Postgres facture.* — module Facture (Bloc E). Réf : facture-schema.md.
// IBAN ultra-sensible stocké ANTI-CLAIR (UUID de secret Vault) — ADR 0013 + ADR 0020.
export const factureSchema = pgSchema("facture");

export const typeFactureEnum = factureSchema.enum("type_facture", [
  "facture_standard",
  "qr_facture",
  "avoir",
  "acompte",
  "autre",
]);
export const deviseEnum = factureSchema.enum("devise", ["CHF", "EUR", "USD", "autre"]);
export const statutPropositionEnum = factureSchema.enum("statut_proposition", [
  "a_valider",
  "validee",
  "rejetee",
]);
export const statutFactureEnum = factureSchema.enum("statut_facture", [
  "en_attente_validation",
  "validee",
  "exportee",
  "payee",
  "annulee",
]);

// ─── facture.fournisseur — référentiel par couple (cabinet, client) ───────────
export const fournisseur = factureSchema.table(
  "fournisseur",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    raison_sociale: text("raison_sociale").notNull(),
    nom_court: text("nom_court"),
    ide: text("ide"),
    numero_tva: text("numero_tva"),
    adresse: jsonb("adresse"),
    // ANTI-CLAIR : UUID du secret Vault contenant l'IBAN (jamais en clair).
    iban_principal_vault_id: uuid("iban_principal_vault_id"),
    bic: text("bic"),
    categorie_habituelle: text("categorie_habituelle"),
    compte_charge_habituel: text("compte_charge_habituel"),
    taux_tva_habituel: numeric("taux_tva_habituel", { precision: 4, scale: 2 }),
    iban_changements: jsonb("iban_changements").notNull().default([]),
    notes: text("notes"),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_fournisseur_lookup").on(t.cabinet_id, t.client_id, t.raison_sociale),
    uniqueIndex("uniq_fournisseur_ide")
      .on(t.cabinet_id, t.client_id, t.ide)
      .where(sql`${t.ide} IS NOT NULL`),
  ],
);

// ─── facture.proposition_facture — extraction IA en attente de validation ─────
export const propositionFacture = factureSchema.table(
  "proposition_facture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    document_id: uuid("document_id")
      .notNull()
      .unique()
      .references(() => document.id, { onDelete: "restrict" }),
    extraction_invocation_id: uuid("extraction_invocation_id")
      .notNull()
      .references(() => invocation.id, { onDelete: "restrict" }),
    statut: statutPropositionEnum("statut").notNull().default("a_valider"),
    fournisseur_existant_id: uuid("fournisseur_existant_id").references(() => fournisseur.id, {
      onDelete: "set null",
    }),
    fournisseur_propose_data: jsonb("fournisseur_propose_data"),
    numero_facture_propose: text("numero_facture_propose"),
    type_propose: typeFactureEnum("type_propose").notNull().default("facture_standard"),
    date_emission_proposee: date("date_emission_proposee"),
    date_echeance_proposee: date("date_echeance_proposee"),
    total_ht_propose: numeric("total_ht_propose", { precision: 14, scale: 2 }),
    total_tva_propose: numeric("total_tva_propose", { precision: 14, scale: 2 }),
    total_ttc_propose: numeric("total_ttc_propose", { precision: 14, scale: 2 }),
    montant_a_payer_propose: numeric("montant_a_payer_propose", { precision: 14, scale: 2 }),
    taux_tva_principal_propose: numeric("taux_tva_principal_propose", { precision: 4, scale: 2 }),
    devise_proposee: deviseEnum("devise_proposee").notNull().default("CHF"),
    categorie_proposee: text("categorie_proposee"),
    qr_facture_detecte: boolean("qr_facture_detecte").notNull().default(false),
    qr_facture_data: jsonb("qr_facture_data"),
    // IBAN-du-QR au Vault dès la proposition (ADR 0024 §5, C6.1) : l'IBAN déterministe du QR-bill
    // est chiffré (Vault, UUID du secret) ; le masque sert à l'affichage (non sensible). L'IBAN
    // de l'IA reste stripé. Jamais d'IBAN en clair au repos (ADR 0013).
    iban_paiement_vault_id: uuid("iban_paiement_vault_id"),
    iban_paiement_masque: text("iban_paiement_masque"),
    confiance_globale: numeric("confiance_globale", { precision: 3, scale: 2 }),
    confiance_par_champ: jsonb("confiance_par_champ"),
    anomalies_detectees: text("anomalies_detectees").array(),
    bbox_sources: jsonb("bbox_sources"),
    doublons_potentiels: uuid("doublons_potentiels").array(),
    valide_par: uuid("valide_par"),
    date_validation: timestamp("date_validation", { withTimezone: true }),
    // FK posée en DB (cycle) — référence facture.facture(id).
    facture_id: uuid("facture_id"),
    rejet_motif: text("rejet_motif"),
    corrections_apportees: jsonb("corrections_apportees"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_proposition_facture_statut").on(t.cabinet_id, t.statut, t.created_at),
    index("idx_proposition_facture_client").on(t.cabinet_id, t.client_id),
  ],
);

// ─── facture.facture — facture validée (source de vérité) ─────────────────────
export const facture = factureSchema.table(
  "facture",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    fournisseur_id: uuid("fournisseur_id")
      .notNull()
      .references(() => fournisseur.id, { onDelete: "restrict" }),
    document_id: uuid("document_id")
      .notNull()
      .unique()
      .references(() => document.id, { onDelete: "restrict" }),
    proposition_id: uuid("proposition_id")
      .unique()
      .references(() => propositionFacture.id, { onDelete: "set null" }),
    numero_facture: text("numero_facture").notNull(),
    type: typeFactureEnum("type").notNull().default("facture_standard"),
    date_emission: date("date_emission").notNull(),
    date_echeance: date("date_echeance"),
    date_reception_zarya: timestamp("date_reception_zarya", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reference_externe: text("reference_externe"),
    total_ht: numeric("total_ht", { precision: 14, scale: 2 }).notNull(),
    total_tva: numeric("total_tva", { precision: 14, scale: 2 }).notNull().default("0"),
    total_ttc: numeric("total_ttc", { precision: 14, scale: 2 }).notNull(),
    montant_a_payer: numeric("montant_a_payer", { precision: 14, scale: 2 }).notNull(),
    taux_tva_principal: numeric("taux_tva_principal", { precision: 4, scale: 2 }),
    devise: deviseEnum("devise").notNull().default("CHF"),
    taux_change: numeric("taux_change", { precision: 10, scale: 6 }),
    // ANTI-CLAIR : UUID du secret Vault contenant l'IBAN de paiement.
    iban_paiement_vault_id: uuid("iban_paiement_vault_id"),
    reference_paiement: text("reference_paiement"),
    qr_facture: boolean("qr_facture").notNull().default(false),
    categorie: text("categorie"),
    compte_charge: text("compte_charge").notNull(),
    statut: statutFactureEnum("statut").notNull().default("en_attente_validation"),
    statut_classement: text("statut_classement").notNull(),
    iban_change_vs_historique: boolean("iban_change_vs_historique").notNull().default(false),
    anomalies_signalees: text("anomalies_signalees").array(),
    cree_par: uuid("cree_par"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_facture_client_date").on(t.cabinet_id, t.client_id, t.date_emission.desc()),
    index("idx_facture_fournisseur_date").on(
      t.cabinet_id,
      t.fournisseur_id,
      t.date_emission.desc(),
    ),
    index("idx_facture_statut").on(t.cabinet_id, t.statut),
    uniqueIndex("uniq_facture_numero").on(t.cabinet_id, t.fournisseur_id, t.numero_facture),
  ],
);

// ─── facture.mapping_export — mapping vers logiciel comptable ──────────────────
export const mappingExport = factureSchema.table(
  "mapping_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    // NULL = mapping cabinet-global.
    client_id: uuid("client_id").references(() => client.id, { onDelete: "restrict" }),
    logiciel_cible: text("logiciel_cible").notNull(),
    version_logiciel: text("version_logiciel"),
    compte_fournisseur_defaut: text("compte_fournisseur_defaut").notNull(),
    mappings_categories: jsonb("mappings_categories").notNull().default({}),
    mappings_tva: jsonb("mappings_tva").notNull().default({}),
    centre_cout_par_client: jsonb("centre_cout_par_client"),
    encodage_fichier: text("encodage_fichier").notNull().default("utf-8"),
    separateur_csv: text("separateur_csv").notNull().default(";"),
    format_date: text("format_date").notNull().default("YYYY-MM-DD"),
    mode_export: text("mode_export").notNull().default("batch_hebdo"),
    inclure_pdf_facture: boolean("inclure_pdf_facture").notNull().default(false),
    actif: boolean("actif").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_mapping_export_lookup").on(t.cabinet_id, t.client_id, t.logiciel_cible)],
);
