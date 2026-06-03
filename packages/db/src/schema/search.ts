import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { cabinet, client } from "./crm";
import { document } from "./doc";
import { invocation } from "./extraction";

// Namespace Postgres search.* — module Search / RAG (Bloc H). Réf : search.md §5 ; ADR 0022.
// Embeddings via Infomaniak (catégorie `embeddings`, modèle bge_multilingual_gemma2, 3584 dim).
export const searchSchema = pgSchema("search");

// halfvec(N) — type pgvector demi-précision (ADDENDUM ADR 0022 : l'index HNSW du type `vector`
// plafonne à 2000 dim ; 3584 > 2000 → halfvec, indexable HNSW jusqu'à 4000 dim).
// L'app lit/écrit l'embedding majoritairement via SQL brut (opérateurs de distance) ; ce type
// sert au mapping Drizzle (insert/select typé number[]).
const halfvec = customType<{ data: number[]; driverData: string; config: { dim: number } }>({
  dataType(config) {
    return `halfvec(${config?.dim ?? 3584})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(",").map(Number);
  },
});

export const documentChunk = searchSchema.table(
  "document_chunk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    document_id: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    client_id: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    chunk_index: integer("chunk_index").notNull(),
    text_content: text("text_content").notNull(),
    // text_tsvector : colonne générée en DB (to_tsvector('french', …)) — non mappée ici
    // (jamais écrite par l'app ; recherche full-text via SQL brut).
    embedding: halfvec("embedding", { dim: 3584 }),
    embedding_model: text("embedding_model"),
    document_type: text("document_type"),
    document_periode: text("document_periode"),
    document_categorie: text("document_categorie"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_search_chunk_cabinet").on(t.cabinet_id),
    index("idx_search_chunk_client").on(t.client_id),
  ],
);

export const searchRequete = searchSchema.table(
  "requete",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cabinet_id: uuid("cabinet_id")
      .notNull()
      .references(() => cabinet.id, { onDelete: "restrict" }),
    // auth.users(id) — géré par Supabase, pas de FK Drizzle.
    utilisateur_id: uuid("utilisateur_id").notNull(),
    question: text("question").notNull(),
    intent_detecte: text("intent_detecte"),
    filtres_appliques: jsonb("filtres_appliques"),
    nb_chunks_recuperes: integer("nb_chunks_recuperes"),
    nb_chunks_utilises: integer("nb_chunks_utilises"),
    duration_ms: integer("duration_ms"),
    llm_invocation_id: uuid("llm_invocation_id").references(() => invocation.id, {
      onDelete: "set null",
    }),
    reponse_text: text("reponse_text"),
    sources_citees: jsonb("sources_citees"),
    utile: boolean("utile"),
    feedback_text: text("feedback_text"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_search_requete_cabinet").on(t.cabinet_id, t.created_at)],
);
