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

// ─── crm.cabinet — Racine du tenant (pas de cabinet_id) ──────────────────────

export const cabinet = crmSchema.table(
  "cabinet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raison_sociale: text("raison_sociale").notNull(),
    ide: text("ide"), // CHE-XXX.XXX.XXX (UID suisse)
    email_contact: text("email_contact"),
    statut: cabinetStatutEnum("statut").notNull().default("actif"),
    plan_tarifaire: planTarifaireEnum("plan_tarifaire").notNull().default("starter"),
    onboarding_termine: boolean("onboarding_termine").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("idx_cabinet_statut").on(t.statut)],
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
