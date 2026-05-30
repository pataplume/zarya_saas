-- Migration 0009 : Fondation CRM v1.0 — Bloc A1 (enrichissement crm.client)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §5.
-- Forward-only, PUREMENT ADDITIF : aucune colonne supprimée/renommée, aucun
-- default existant retiré. Les colonnes NOT NULL ajoutées portent toutes un
-- DEFAULT → les lignes existantes sont remplies sans rupture, et les INSERT
-- applicatifs actuels (qui n'envoient pas ces colonnes) continuent de marcher.
--
-- Divergences ASSUMÉES vs crm-schema.md §5 (documentées dans crm.ts) :
--   - `statut` conserve son DEFAULT historique 'actif' (pas 'prospect') ;
--   - `onboarding_session_id` / `onboarding_termine` DIFFÉRÉS au Bloc F
--     (table onboarding_client.session inexistante → anti-FK-fantôme).
--
-- RLS : crm.client a déjà ses 4 policies (cf. 0004). ADD COLUMN ne les affecte
-- pas → rien à refaire ici.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Extension pg_trgm (recherche par nom — index GIN trigram)
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (gardés idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.client_type AS ENUM ('pme', 'independant', 'prive', 'association');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.langue AS ENUM ('fr', 'de', 'it', 'en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.canal_prefere AS ENUM ('email', 'courrier', 'telephone', 'dashboard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Colonnes (toutes additives ; NOT NULL ⇒ DEFAULT pour remplir l'existant)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.client
  ADD COLUMN IF NOT EXISTS type                crm.client_type    NOT NULL DEFAULT 'pme',
  ADD COLUMN IF NOT EXISTS nom_court           text,
  ADD COLUMN IF NOT EXISTS numero_tva          text,
  ADD COLUMN IF NOT EXISTS forme_juridique     text,
  ADD COLUMN IF NOT EXISTS langue              crm.langue         NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS canal_prefere       crm.canal_prefere  NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS responsable_id      uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_creation       date               NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS date_debut_relation date,
  ADD COLUMN IF NOT EXISTS date_fin_relation   date,
  ADD COLUMN IF NOT EXISTS source_acquisition  text,
  ADD COLUMN IF NOT EXISTS tags                text[],
  ADD COLUMN IF NOT EXISTS notes_commerciales  text;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Index (cf. crm-schema.md §5)
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_client_cabinet_statut
  ON crm.client (cabinet_id, statut);

CREATE INDEX IF NOT EXISTS idx_client_cabinet_responsable
  ON crm.client (cabinet_id, responsable_id);

CREATE INDEX IF NOT EXISTS idx_client_raison_trgm
  ON crm.client USING gin (raison_sociale gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger de cohérence cabinet/responsable (sécurité multi-tenant)
-- Empêche d'affecter à un client un membre référent (responsable_id) qui
-- appartiendrait à un AUTRE cabinet. Même pattern que fn_check_client_cabinet.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crm.fn_check_responsable_cabinet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.responsable_id IS NOT NULL THEN
    IF (SELECT cabinet_id FROM crm.cabinet_membre WHERE id = NEW.responsable_id)
       IS DISTINCT FROM NEW.cabinet_id THEN
      RAISE EXCEPTION 'Incohérence cabinet/responsable : le membre % n''appartient pas au cabinet %',
        NEW.responsable_id, NEW.cabinet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_responsable_cabinet_client ON crm.client;
CREATE TRIGGER trg_check_responsable_cabinet_client
  BEFORE INSERT OR UPDATE ON crm.client
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_responsable_cabinet();
