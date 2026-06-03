-- Migration 0041 : Bloc H1 — schéma search.* (recherche conversationnelle / RAG).
-- Réf : docs/modules/search.md §5 ; ADR 0022 (embeddings & RAG, modèle bge_multilingual_gemma2,
-- vector 3584) + son ADDENDUM halfvec (ci-dessous) ; KICKOFF Bloc H (H1).
-- Forward-only, purement additif. Première ouverture du schéma search.*.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id NOT NULL ; document_chunk porte aussi un client_id
-- (nullable — un document peut n'être lié à aucun client) avec cohérence via le trigger
-- crm.fn_check_client_cabinet (qui ignore client_id NULL). RLS 4 policies par table.
--
-- ⚠️ ADDENDUM ADR 0022 (halfvec) : pgvector plafonne l'index HNSW du type `vector` à 2000
-- dimensions. L'embedding bge_multilingual_gemma2 fait 3584 dim → on stocke et indexe la colonne
-- en `halfvec(3584)` (demi-précision, HNSW supporté jusqu'à 4000 dim en pgvector ≥ 0.7). Perte de
-- rappel négligeable, stockage /2. Décision founder 2026-06-03.
--
-- Périmètre H1 = STRUCTURE (document_chunk + requete + index + RLS). search.cache_question
-- (Phase 2) DIFFÉRÉE. L'indexation (chunking + embeddings) = H2 ; la récupération = H3.

CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector 0.8.0 (fournit `vector` et `halfvec`)

CREATE SCHEMA IF NOT EXISTS search;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. search.document_chunk — chunks de documents + embeddings (RAG)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search.document_chunk (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  document_id     uuid NOT NULL REFERENCES doc.document(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES crm.client(id) ON DELETE SET NULL,

  -- Contenu
  chunk_index     integer NOT NULL,
  text_content    text NOT NULL,
  text_tsvector   tsvector GENERATED ALWAYS AS (to_tsvector('french', text_content)) STORED,

  -- Embedding (nullable : le chunk peut être créé avant son indexation par H2).
  -- halfvec(3584) — voir ADDENDUM ADR 0022 ci-dessus.
  embedding       halfvec(3584),
  embedding_model text,                    -- catégorie 'embeddings' IK, id résolu au runtime (renseigné à l'indexation)

  -- Métadonnées de filtrage (dénormalisées depuis doc.document)
  document_type      text,
  document_periode   text,                 -- '2026-04', '2025-Q1'
  document_categorie text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Un chunk unique par (document, index).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_search_chunk_doc_index
  ON search.document_chunk (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_search_chunk_cabinet
  ON search.document_chunk (cabinet_id);
CREATE INDEX IF NOT EXISTS idx_search_chunk_client
  ON search.document_chunk (client_id);
-- Full-text (français) — moitié lexicale de la récupération hybride (H3).
CREATE INDEX IF NOT EXISTS idx_search_chunk_tsvector
  ON search.document_chunk USING gin (text_tsvector);
-- ANN cosinus (HNSW sur halfvec) — moitié sémantique de la récupération hybride (H3).
CREATE INDEX IF NOT EXISTS idx_search_chunk_embedding
  ON search.document_chunk USING hnsw (embedding halfvec_cosine_ops);

COMMENT ON COLUMN search.document_chunk.embedding IS
  'halfvec(3584) — embedding bge_multilingual_gemma2 (catégorie IK `embeddings`). halfvec '
  '(demi-précision) car l''index HNSW du type vector plafonne à 2000 dim (ADDENDUM ADR 0022).';

-- Trigger de cohérence cabinet/client (ignore client_id NULL).
CREATE TRIGGER trg_check_client_cabinet_search_chunk
  BEFORE INSERT OR UPDATE ON search.document_chunk
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. search.requete — historique des recherches (audit, feedback, amélioration)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search.requete (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id          uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  -- auth.users(id) — pas de FK explicite (Supabase gère auth.*), convention ZARYA.
  utilisateur_id      uuid NOT NULL,
  question            text NOT NULL,
  intent_detecte      text,                -- 'factuelle' | 'recherche' | 'agregation' | 'synthese' | 'hors_scope'
  filtres_appliques   jsonb,               -- { client_id, date_min, ... }

  -- Pipeline
  nb_chunks_recuperes integer,
  nb_chunks_utilises  integer,
  duration_ms         integer,

  -- LLM
  llm_invocation_id   uuid REFERENCES extraction.invocation(id) ON DELETE SET NULL,

  -- Réponse
  reponse_text        text,
  sources_citees      jsonb,               -- [{ document_id, chunk_id, ... }]

  -- Feedback utilisateur
  utile               boolean,
  feedback_text       text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_requete_cabinet
  ON search.requete (cabinet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_requete_user
  ON search.requete (utilisateur_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS — isolation multi-tenant (4 policies génériques par table)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['document_chunk', 'requete'] LOOP
    EXECUTE format('ALTER TABLE search.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON search.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON search.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON search.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON search.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Grants — schéma applicatif (rôle authenticated), comme facture/salaire.
-- ════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA search TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA search TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA search
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
