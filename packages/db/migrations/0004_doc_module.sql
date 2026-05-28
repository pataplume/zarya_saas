-- Migration 0004 : Module Doc (Phase 3, Sprint 3.1)
-- Crée : crm.client (minimal), extraction.invocation, doc.* (upload_brut,
-- fichier_physique, proposition_classement, document) + RLS + grants + triggers.
-- Multi-tenant strict (ADR 0005) — isolation par cabinet_id via current_cabinet_id().
-- Migration écrite à la main (pattern existant des migrations RLS/grants).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. crm.client (version minimale Phase 3)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE crm.statut_client AS ENUM ('prospect', 'actif', 'inactif', 'archive');

CREATE TABLE crm.client (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  raison_sociale  text NOT NULL,
  ide             text,
  statut          crm.statut_client NOT NULL DEFAULT 'actif',
  email_contact   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX idx_client_cabinet ON crm.client (cabinet_id, archived_at);
CREATE UNIQUE INDEX uniq_client_ide_per_cabinet ON crm.client (cabinet_id, ide);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. extraction.invocation (traçabilité IA/OCR — ADR 0003, ADR 0007)
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS extraction;

-- Contexte d'appel — aligné sur ExtractionContext (extraction-ia.md § 4.1)
CREATE TYPE extraction.context AS ENUM (
  'employes', 'clients', 'classification_doc', 'facture', 'changement_salaire', 'autre'
);

-- Type d'input — aligné sur ExtractionInput.type (extraction-ia.md § 4.1)
CREATE TYPE extraction.input_type AS ENUM ('file', 'text', 'document_id');

-- Statut d'invocation (extraction-ia.md § 6.1 + § 9.3 ocr_failed)
CREATE TYPE extraction.invocation_status AS ENUM (
  'success', 'validation_error', 'timeout', 'rate_limit', 'ocr_failed', 'unknown_error'
);

-- Schéma complet conforme à extraction-ia.md § 6.1 (pas de version simplifiée).
CREATE TABLE extraction.invocation (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id               uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  context                  extraction.context NOT NULL,
  invoked_by_module        text NOT NULL,
  invoked_by_user_id       uuid,  -- auth.users, pas de FK
  -- Input
  input_type               extraction.input_type NOT NULL,
  input_document_id        uuid,  -- FK doc.document évitée (circulaire), uuid simple
  input_text_hash          text,
  input_size_bytes         bigint,
  -- Configuration de l'appel
  model_used               text NOT NULL,  -- 'stub' en mode EXTRACTION_MODE=stub
  bedrock_region           text NOT NULL DEFAULT 'eu-central-1',
  bedrock_request_id       text,
  prompt_version           text NOT NULL,  -- 'stub' si pas d'appel LLM
  ocr_engine               text,
  ocr_duration_ms          integer,
  -- Résultats
  status                   extraction.invocation_status NOT NULL DEFAULT 'success',
  nb_items_extracted       integer NOT NULL DEFAULT 0,
  nb_items_with_anomalies  integer NOT NULL DEFAULT 0,
  raw_output               jsonb,
  error_message            text,
  -- Métriques
  total_duration_ms        integer,
  tokens_input             integer,
  tokens_output            integer,
  cost_usd                 numeric(10,6),  -- coût brut Bedrock (USD), conversion CHF en aval

  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invocation_cabinet ON extraction.invocation (cabinet_id, created_at);
CREATE INDEX idx_invocation_context ON extraction.invocation (context, status);
CREATE INDEX idx_invocation_cost ON extraction.invocation (cabinet_id, created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. doc.* — schéma + enums
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS doc;

CREATE TYPE doc.source_ingestion AS ENUM (
  'email_microsoft', 'email_autre', 'nas',
  'upload_fiduciaire', 'upload_client', 'api', 'import_manuel'
);

CREATE TYPE doc.statut_traitement AS ENUM (
  'recu', 'en_classification', 'a_valider', 'valide', 'rejete', 'doublon', 'erreur'
);

CREATE TYPE doc.categorie_document AS ENUM (
  'bancaire', 'fiscal', 'salaire', 'commercial', 'administratif', 'autre'
);

CREATE TYPE doc.statut_classement AS ENUM (
  'auto', 'valide_humain', 'corrige_humain', 'manuel'
);

-- ─── doc.upload_brut ─────────────────────────────────────────────────────────

CREATE TABLE doc.upload_brut (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id            uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  source                doc.source_ingestion NOT NULL,
  uploaded_par          uuid NOT NULL,  -- auth.users, pas de FK
  client_id             uuid REFERENCES crm.client(id) ON DELETE SET NULL,
  nom_fichier_original  text NOT NULL,
  taille_octets         bigint NOT NULL,
  type_mime             text NOT NULL,
  hash_contenu          text NOT NULL,  -- SHA-256
  commentaire_uploader  text,
  statut                doc.statut_traitement NOT NULL DEFAULT 'recu',
  date_upload           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_upload_brut_cabinet ON doc.upload_brut (cabinet_id, date_upload);
CREATE INDEX idx_upload_brut_hash ON doc.upload_brut (hash_contenu);
CREATE INDEX idx_upload_brut_client ON doc.upload_brut (client_id);

-- ─── doc.fichier_physique ────────────────────────────────────────────────────

CREATE TABLE doc.fichier_physique (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id          uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  hash_contenu        text NOT NULL,  -- SHA-256
  taille_octets       bigint NOT NULL,
  type_mime           text NOT NULL,
  storage_provider    text NOT NULL DEFAULT 'supabase',
  storage_bucket      text,
  storage_path        text NOT NULL,
  nb_pages            integer,
  ocr_done            boolean NOT NULL DEFAULT false,
  ocr_text            text,
  ocr_invocation_id   uuid REFERENCES extraction.invocation(id) ON DELETE SET NULL,
  upload_brut_id      uuid REFERENCES doc.upload_brut(id) ON DELETE SET NULL,
  email_brut_id       uuid,  -- doc.email_brut différé (Phase 4), pas de FK
  source              doc.source_ingestion NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_fichier_hash_per_cabinet UNIQUE (cabinet_id, hash_contenu)
);

CREATE INDEX idx_fichier_physique_storage ON doc.fichier_physique (storage_provider, storage_path);

-- ─── doc.proposition_classement ──────────────────────────────────────────────

CREATE TABLE doc.proposition_classement (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id                  uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  fichier_physique_id         uuid NOT NULL REFERENCES doc.fichier_physique(id) ON DELETE CASCADE,
  extraction_invocation_id    uuid REFERENCES extraction.invocation(id) ON DELETE SET NULL,
  statut                      doc.statut_traitement NOT NULL DEFAULT 'a_valider',
  type_propose                text,
  categorie_proposee          doc.categorie_document,
  client_id_propose           uuid REFERENCES crm.client(id) ON DELETE SET NULL,
  document_attendu_id_propose uuid,  -- crm.document_attendu différé (Phase 4)
  periode_proposee            text,
  libelle_propose             text,
  fournisseur_propose         text,
  montant_propose             numeric(14,2),
  devise_proposee             text,
  date_document_proposee      date,
  confiance_globale           numeric(3,2),
  confiance_par_champ         jsonb,
  anomalies_detectees         text[],
  doublons_potentiels         uuid[],
  valide_par                  uuid,  -- auth.users, pas de FK
  date_validation             timestamptz,
  document_id                 uuid,  -- FK circulaire évitée (lien inverse porte la contrainte)
  rejet_motif                 text,
  corrections_apportees       jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposition_inbox ON doc.proposition_classement (cabinet_id, statut, created_at);
CREATE INDEX idx_proposition_fichier ON doc.proposition_classement (fichier_physique_id);
CREATE INDEX idx_proposition_client ON doc.proposition_classement (client_id_propose);

-- ─── doc.document ────────────────────────────────────────────────────────────

CREATE TABLE doc.document (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id                uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                 uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  fichier_physique_id       uuid NOT NULL REFERENCES doc.fichier_physique(id) ON DELETE RESTRICT,
  proposition_classement_id uuid UNIQUE REFERENCES doc.proposition_classement(id) ON DELETE SET NULL,
  type                      text NOT NULL,
  categorie                 doc.categorie_document NOT NULL,
  document_attendu_id       uuid,  -- crm.document_attendu différé (Phase 4)
  periode                   text,
  date_document             date,
  date_reception            timestamptz NOT NULL DEFAULT now(),
  libelle                   text NOT NULL,
  nom_fichier_standardise   text,
  reference_externe         text,
  statut_classement         doc.statut_classement NOT NULL,
  confiance_classement      numeric(3,2),
  facture_id                uuid,  -- facture.facture différé (Phase 4)
  salaire_periode_id        uuid,  -- salaire.periode différé (Phase 4)
  cree_par                  uuid,  -- auth.users, null si auto
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  archived_at               timestamptz
);

CREATE INDEX idx_document_client_periode ON doc.document (cabinet_id, client_id, periode);
CREATE INDEX idx_document_type ON doc.document (cabinet_id, type, periode);
CREATE INDEX idx_document_statut ON doc.document (cabinet_id, statut_classement);
CREATE INDEX idx_document_reception ON doc.document (date_reception);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger de cohérence cabinet/client (multi-tenant.md § 7 — sécurité)
-- Empêche de rattacher un client d'un autre cabinet à un document/upload.
-- ════════════════════════════════════════════════════════════════════════════

-- Vérifie la colonne client_id (upload_brut, document)
CREATE OR REPLACE FUNCTION doc.fn_check_client_cabinet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    IF (SELECT cabinet_id FROM crm.client WHERE id = NEW.client_id) IS DISTINCT FROM NEW.cabinet_id THEN
      RAISE EXCEPTION 'Incohérence cabinet/client : le client % n''appartient pas au cabinet %',
        NEW.client_id, NEW.cabinet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Vérifie la colonne client_id_propose (proposition_classement)
CREATE OR REPLACE FUNCTION doc.fn_check_client_propose_cabinet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_id_propose IS NOT NULL THEN
    IF (SELECT cabinet_id FROM crm.client WHERE id = NEW.client_id_propose) IS DISTINCT FROM NEW.cabinet_id THEN
      RAISE EXCEPTION 'Incohérence cabinet/client : le client % n''appartient pas au cabinet %',
        NEW.client_id_propose, NEW.cabinet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_client_cabinet_upload
  BEFORE INSERT OR UPDATE ON doc.upload_brut
  FOR EACH ROW EXECUTE FUNCTION doc.fn_check_client_cabinet();

CREATE TRIGGER trg_check_client_cabinet_document
  BEFORE INSERT OR UPDATE ON doc.document
  FOR EACH ROW EXECUTE FUNCTION doc.fn_check_client_cabinet();

CREATE TRIGGER trg_check_client_cabinet_proposition
  BEFORE INSERT OR UPDATE ON doc.proposition_classement
  FOR EACH ROW EXECUTE FUNCTION doc.fn_check_client_propose_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — isolation multi-tenant sur toutes les nouvelles tables métier
-- Pattern maison (cf. 0001/0002) : 4 policies génériques par table
-- (tenant_isolation_select/insert/update/delete) via current_cabinet_id().
-- Le service_role bypasse (pas de FORCE) pour provisioning/jobs/pipeline IA.
-- ════════════════════════════════════════════════════════════════════════════

-- crm.client
ALTER TABLE crm.client ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.client
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.client
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.client
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.client
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- extraction.invocation
ALTER TABLE extraction.invocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON extraction.invocation
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON extraction.invocation
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON extraction.invocation
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON extraction.invocation
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- doc.upload_brut
ALTER TABLE doc.upload_brut ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.upload_brut
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.upload_brut
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.upload_brut
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.upload_brut
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- doc.fichier_physique
ALTER TABLE doc.fichier_physique ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.fichier_physique
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.fichier_physique
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.fichier_physique
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.fichier_physique
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- doc.proposition_classement
ALTER TABLE doc.proposition_classement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.proposition_classement
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.proposition_classement
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.proposition_classement
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.proposition_classement
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- doc.document
ALTER TABLE doc.document ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.document
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.document
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.document
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.document
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants pour le rôle authenticated (RLS filtre les lignes)
-- ════════════════════════════════════════════════════════════════════════════

-- extraction
GRANT USAGE ON SCHEMA extraction TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA extraction TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA extraction GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- doc
GRANT USAGE ON SCHEMA doc TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA doc TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA doc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- crm.client est couvert par les grants existants sur le schéma crm (migration 0003).
