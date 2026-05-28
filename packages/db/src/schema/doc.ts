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
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, client } from "./crm";
import { invocation } from "./extraction";

// Namespace Postgres doc.* — gestion documentaire (module Doc, Phase 3)
// Périmètre Sprint 3.1 : upload manuel → fichier physique → proposition → document.
// Différés (Phase 4+) : email_brut (Microsoft Graph), document_version, document_tag,
// cabinet_convention_nommage, regle_auto_classement, intégration NAS.
export const docSchema = pgSchema("doc");

// ─── Enums ───────────────────────────────────────────────────────────────────

export const sourceIngestionEnum = docSchema.enum("source_ingestion", [
  "email_microsoft",
  "email_autre",
  "nas",
  "upload_fiduciaire",
  "upload_client",
  "api",
  "import_manuel",
]);

export const statutTraitementEnum = docSchema.enum("statut_traitement", [
  "recu",
  "en_classification",
  "a_valider",
  "valide",
  "rejete",
  "doublon",
  "erreur",
]);

export const categorieDocumentEnum = docSchema.enum("categorie_document", [
  "bancaire",
  "fiscal",
  "salaire",
  "commercial",
  "administratif",
  "autre",
]);

export const statutClassementEnum = docSchema.enum("statut_classement", [
  "auto",
  "valide_humain",
  "corrige_humain",
  "manuel",
]);

// ─── doc.upload_brut — Uploads manuels (drag & drop, dashboard client) ────────

export const uploadBrut = docSchema.table(
  "upload_brut",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    source: sourceIngestionEnum("source").notNull(),
    // Référence auth.users(id) — pas de FK explicite (Supabase gère auth.*)
    uploaded_par: uuid("uploaded_par").notNull(),
    client_id: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    nom_fichier_original: text("nom_fichier_original").notNull(),
    taille_octets: bigint("taille_octets", { mode: "number" }).notNull(),
    type_mime: text("type_mime").notNull(),
    hash_contenu: text("hash_contenu").notNull(), // SHA-256
    commentaire_uploader: text("commentaire_uploader"),
    statut: statutTraitementEnum("statut").notNull().default("recu"),
    date_upload: timestamp("date_upload", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_upload_brut_cabinet").on(t.cabinet_id, t.date_upload),
    index("idx_upload_brut_hash").on(t.hash_contenu),
    index("idx_upload_brut_client").on(t.client_id),
  ],
);

// ─── doc.fichier_physique — Fichier réellement stocké (déduplication) ─────────

export const fichierPhysique = docSchema.table(
  "fichier_physique",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    hash_contenu: text("hash_contenu").notNull(), // SHA-256 du contenu
    taille_octets: bigint("taille_octets", { mode: "number" }).notNull(),
    type_mime: text("type_mime").notNull(),
    storage_provider: text("storage_provider").notNull().default("supabase"),
    storage_bucket: text("storage_bucket"),
    storage_path: text("storage_path").notNull(),
    nb_pages: integer("nb_pages"),
    ocr_done: boolean("ocr_done").notNull().default(false),
    ocr_text: text("ocr_text"),
    ocr_invocation_id: uuid("ocr_invocation_id").references(() => invocation.id, {
      onDelete: "set null",
    }),
    upload_brut_id: uuid("upload_brut_id").references(() => uploadBrut.id, {
      onDelete: "set null",
    }),
    // doc.email_brut différé (Phase 4) — uuid simple sans FK pour l'instant
    email_brut_id: uuid("email_brut_id"),
    source: sourceIngestionEnum("source").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Déduplication : un même contenu n'existe qu'une fois par cabinet
    unique("uniq_fichier_hash_per_cabinet").on(t.cabinet_id, t.hash_contenu),
    index("idx_fichier_physique_storage").on(t.storage_provider, t.storage_path),
  ],
);

// ─── doc.proposition_classement — Propositions IA en attente de validation ────

export const propositionClassement = docSchema.table(
  "proposition_classement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    fichier_physique_id: uuid("fichier_physique_id")
      .notNull()
      .references(() => fichierPhysique.id, { onDelete: "cascade" }),
    // Nullable : un document créé manuellement (statut 'manuel') n'a pas d'invocation IA
    extraction_invocation_id: uuid("extraction_invocation_id").references(() => invocation.id, {
      onDelete: "set null",
    }),
    statut: statutTraitementEnum("statut").notNull().default("a_valider"),
    // ── Champs proposés ──
    type_propose: text("type_propose"),
    categorie_proposee: categorieDocumentEnum("categorie_proposee"),
    client_id_propose: uuid("client_id_propose").references(() => client.id, {
      onDelete: "set null",
    }),
    // crm.document_attendu différé (Phase 4) — uuid simple sans FK
    document_attendu_id_propose: uuid("document_attendu_id_propose"),
    periode_proposee: text("periode_proposee"),
    libelle_propose: text("libelle_propose"),
    fournisseur_propose: text("fournisseur_propose"),
    montant_propose: numeric("montant_propose", { precision: 14, scale: 2 }),
    devise_proposee: text("devise_proposee"),
    date_document_proposee: date("date_document_proposee"),
    confiance_globale: numeric("confiance_globale", { precision: 3, scale: 2 }),
    confiance_par_champ: jsonb("confiance_par_champ"),
    anomalies_detectees: text("anomalies_detectees").array(),
    doublons_potentiels: uuid("doublons_potentiels").array(),
    // ── Validation ──
    valide_par: uuid("valide_par"), // auth.users, pas de FK
    date_validation: timestamp("date_validation", { withTimezone: true }),
    // FK circulaire avec doc.document évitée : uuid simple (le lien inverse
    // document.proposition_classement_id porte la contrainte référentielle)
    document_id: uuid("document_id"),
    rejet_motif: text("rejet_motif"),
    corrections_apportees: jsonb("corrections_apportees"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_proposition_inbox").on(t.cabinet_id, t.statut, t.created_at),
    index("idx_proposition_fichier").on(t.fichier_physique_id),
    index("idx_proposition_client").on(t.client_id_propose),
  ],
);

// ─── doc.document — Document validé et classé (source de vérité) ──────────────

export const document = docSchema.table(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    client_id: uuid("client_id")
      .notNull()
      .references(() => client.id, { onDelete: "restrict" }),
    fichier_physique_id: uuid("fichier_physique_id")
      .notNull()
      .references(() => fichierPhysique.id, { onDelete: "restrict" }),
    proposition_classement_id: uuid("proposition_classement_id")
      .unique()
      .references(() => propositionClassement.id, { onDelete: "set null" }),
    // ── Classification ──
    type: text("type").notNull(), // slug standardisé
    categorie: categorieDocumentEnum("categorie").notNull(),
    // crm.document_attendu différé (Phase 4) — uuid simple sans FK
    document_attendu_id: uuid("document_attendu_id"),
    periode: text("periode"),
    date_document: date("date_document"),
    date_reception: timestamp("date_reception", { withTimezone: true }).notNull().defaultNow(),
    // ── Identification ──
    libelle: text("libelle").notNull(),
    nom_fichier_standardise: text("nom_fichier_standardise"),
    reference_externe: text("reference_externe"),
    // ── Statut ──
    statut_classement: statutClassementEnum("statut_classement").notNull(),
    confiance_classement: numeric("confiance_classement", { precision: 3, scale: 2 }),
    // ── Liens vers modules différés (facture.facture, salaire.periode — Phase 4) ──
    facture_id: uuid("facture_id"),
    salaire_periode_id: uuid("salaire_periode_id"),
    // ── Audit ──
    cree_par: uuid("cree_par"), // auth.users, null si auto
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_document_client_periode").on(t.cabinet_id, t.client_id, t.periode),
    index("idx_document_type").on(t.cabinet_id, t.type, t.periode),
    index("idx_document_statut").on(t.cabinet_id, t.statut_classement),
    index("idx_document_reception").on(t.date_reception),
  ],
);
