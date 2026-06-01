import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet } from "./crm";

// Namespace Postgres audit.* — journaux append-only (security-and-audit.md §8).
// Première table du schéma : audit.api_externe (Bloc D2, migration 0025). Les autres
// tables §8.2 (connexion, acces_donnee_sensible, export, modification_permission)
// seront posées à leurs blocs respectifs.
export const auditSchema = pgSchema("audit");

// ─── audit.api_externe ─────────────────────────────────────────────────────────
//
// Un appel sortant vers une API tierce (Microsoft Graph, à terme Bexio/Zefix/…).
// APPEND-ONLY : aucune UPDATE/DELETE (REVOKE + trigger fn_append_only, migration 0025).
// Multi-tenant : cabinet_id NOT NULL ; PAS de client_id (appel au niveau cabinet).
// metadata = contexte NON sensible uniquement (jamais de token / corps / PII).
export const apiExterne = auditSchema.table(
  "api_externe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    status_code: integer("status_code"),
    ok: boolean("ok").notNull(),
    error_code: text("error_code"),
    latency_ms: integer("latency_ms").notNull(),
    acteur_type: text("acteur_type"),
    acteur_id: uuid("acteur_id"),
    metadata: jsonb("metadata").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_api_externe_cabinet_date").on(t.cabinet_id, t.created_at.desc()),
    index("idx_api_externe_cabinet_provider").on(t.cabinet_id, t.provider, t.created_at.desc()),
  ],
);
