import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet } from "./crm";

// Namespace Postgres extraction.* — traçabilité des appels IA/OCR (ADR 0003, ADR 0007)
// Schéma complet conforme à /docs/modules/extraction-ia.md § 6.1.
// NB : noms de colonnes alignés sur la spec (anglais) car c'est la table technique
// transverse définie en SQL explicite dans extraction-ia.md ; à frenchifier si on
// veut l'homogénéité avec crm.*/doc.* (à trancher).
export const extractionSchema = pgSchema("extraction");

// ─── Enums ───────────────────────────────────────────────────────────────────

// Contexte d'appel — aligné sur ExtractionContext (extraction-ia.md § 4.1)
export const extractionContextEnum = extractionSchema.enum("context", [
  "employes",
  "clients",
  "classification_doc",
  "facture",
  "changement_salaire",
  "autre",
]);

// Type d'input — aligné sur ExtractionInput.type (extraction-ia.md § 4.1)
export const extractionInputTypeEnum = extractionSchema.enum("input_type", [
  "file",
  "text",
  "document_id",
]);

// Statut d'invocation (extraction-ia.md § 6.1 + § 9.3 ocr_failed)
export const extractionStatusEnum = extractionSchema.enum("invocation_status", [
  "success",
  "validation_error",
  "timeout",
  "rate_limit",
  "ocr_failed",
  "unknown_error",
]);

// ─── extraction.invocation — Une ligne par appel LLM/OCR ─────────────────────
// Audit, facturation à l'usage, debug, détection de régressions de prompt.
// Le mode stub (EXTRACTION_MODE=stub) écrit une ligne model_used='stub',
// prompt_version='stub' — Bedrock se rebranche en changeant l'implémentation
// du Classifier sans toucher au schéma.

export const invocation = extractionSchema.table(
  "invocation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    context: extractionContextEnum("context").notNull(),
    invoked_by_module: text("invoked_by_module").notNull(),
    // auth.users(id) — pas de FK explicite (Supabase gère auth.*)
    invoked_by_user_id: uuid("invoked_by_user_id"),
    // ── Input ──
    input_type: extractionInputTypeEnum("input_type").notNull(),
    // FK doc.document évitée (dépendance circulaire : doc.* référence invocation) — uuid simple
    input_document_id: uuid("input_document_id"),
    input_text_hash: text("input_text_hash"),
    input_size_bytes: bigint("input_size_bytes", { mode: "number" }),
    // ── Configuration de l'appel ──
    model_used: text("model_used").notNull(),
    bedrock_region: text("bedrock_region").notNull().default("eu-central-1"),
    bedrock_request_id: text("bedrock_request_id"),
    prompt_version: text("prompt_version").notNull(),
    ocr_engine: text("ocr_engine"),
    ocr_duration_ms: integer("ocr_duration_ms"),
    // ── Résultats ──
    status: extractionStatusEnum("status").notNull().default("success"),
    nb_items_extracted: integer("nb_items_extracted").notNull().default(0),
    nb_items_with_anomalies: integer("nb_items_with_anomalies").notNull().default(0),
    raw_output: jsonb("raw_output"),
    error_message: text("error_message"),
    // ── Métriques ──
    total_duration_ms: integer("total_duration_ms"),
    tokens_input: integer("tokens_input"),
    tokens_output: integer("tokens_output"),
    // Coût brut facturé par Bedrock (USD = source de vérité). Conversion CHF en
    // aval pour les quotas/facturation cabinet (extraction-ia.md § 8).
    cost_usd: numeric("cost_usd", { precision: 10, scale: 6 }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_invocation_cabinet").on(t.cabinet_id, t.created_at),
    index("idx_invocation_context").on(t.context, t.status),
    index("idx_invocation_cost").on(t.cabinet_id, t.created_at),
  ],
);
