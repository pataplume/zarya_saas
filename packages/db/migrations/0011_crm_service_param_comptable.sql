-- Migration 0011 : Fondation CRM — Bloc A3 (crm.service + crm.param_comptable)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §10 et §11.
-- Forward-only, purement additif : deux nouvelles tables, aucun changement sur
-- l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé ; cohérence avec
-- client.cabinet_id garantie par fn_check_client_cabinet (réutilisé, défini en
-- 0005). RLS activée + 4 policies génériques par table via current_cabinet_id().
--
-- Divergences ASSUMÉES vs crm-schema.md :
--   - §10 service : la contrainte « UNIQUE(client_id, type) » est implémentée en
--     index unique PARTIEL (WHERE actif AND archived_at IS NULL), fidèle à
--     l'intention « au plus une instance ACTIVE » et autorisant l'historisation.
--   - §11 param_comptable : on ajoute created_at/updated_at (convention db/CLAUDE.md
--     §2). `acces_logiciel_externe` (credentials) est ULTRA-SENSIBLE → tout écriture
--     DOIT chiffrer via Supabase Vault (aucun chemin d'écriture n'existe encore).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.type_service AS ENUM
    ('comptabilite', 'fiscalite', 'salaires', 'tva', 'bouclement', 'conseil');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.frequence_service AS ENUM
    ('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle', 'ponctuelle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.logiciel_comptable AS ENUM
    ('bexio', 'abacus', 'cresus', 'winbiz', 'banana', 'excel', 'officemaker', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.mode_transmission AS ENUM
    ('email', 'nas_partage', 'connecteur_logiciel', 'physique');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.service — Prestations souscrites par un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.service (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id          uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  type                crm.type_service NOT NULL,
  actif               boolean NOT NULL DEFAULT true,
  date_activation     date NOT NULL DEFAULT CURRENT_DATE,
  date_desactivation  date,
  frequence           crm.frequence_service,
  parametres          jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_service_cabinet ON crm.service (cabinet_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_service_client  ON crm.service (cabinet_id, client_id);

-- Au plus 1 service actif de chaque type par client (archivés exclus).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_actif_per_client_type
  ON crm.service (client_id, type)
  WHERE actif AND archived_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.param_comptable — Paramétrage comptable du client (1-1, client_id = PK)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.param_comptable (
  client_id                uuid PRIMARY KEY REFERENCES crm.client(id) ON DELETE RESTRICT,
  cabinet_id               uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  logiciel                 crm.logiciel_comptable,
  logiciel_autre           text,
  plan_comptable           text,
  date_debut_exercice      date,
  date_bouclement          date,
  mode_transmission        crm.mode_transmission,
  acces_logiciel_externe   jsonb,  -- ULTRA-SENSIBLE : chiffrer via Vault à l'écriture
  derniere_synchronisation timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_param_comptable_cabinet ON crm.param_comptable (cabinet_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Triggers de cohérence cabinet/client (multi-tenant.md §7 — sécurité)
-- Réutilise crm.fn_check_client_cabinet (définie en 0005).
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_service ON crm.service;
CREATE TRIGGER trg_check_client_cabinet_service
  BEFORE INSERT OR UPDATE ON crm.service
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

DROP TRIGGER IF EXISTS trg_check_client_cabinet_param_comptable ON crm.param_comptable;
CREATE TRIGGER trg_check_client_cabinet_param_comptable
  BEFORE INSERT OR UPDATE ON crm.param_comptable
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — isolation multi-tenant (4 policies génériques par table)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.service ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.service
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.service
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.service
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.service
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.param_comptable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.param_comptable
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.param_comptable
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.param_comptable
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.param_comptable
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
