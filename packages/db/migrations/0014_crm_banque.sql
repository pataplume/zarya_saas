-- Migration 0014 : Fondation CRM — Bloc A6 (crm.banque)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §12.
-- Forward-only, purement additif : une nouvelle table, aucun changement sur l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé ; cohérence avec
-- client.cabinet_id garantie par fn_check_client_cabinet (réutilisé, défini en
-- 0005). RLS activée + 4 policies génériques via current_cabinet_id().
--
-- ⚠️ SÉCURITÉ (ADR 0013) : `iban` et `credentials_open_banking` sont ULTRA-SENSIBLES
-- et DOIVENT être chiffrés au repos. Aucun chemin d'écriture n'existe encore (table
-- de contrat). Le choix du mécanisme de chiffrement (Supabase Vault / pgsodium TCE /
-- AEAD applicatif) et son enforcement sont tranchés/portés par l'ADR 0013 et la
-- feature qui peuplera ces colonnes — pas par ce run de schéma. Les COMMENT ON COLUMN
-- ci-dessous matérialisent l'exigence en base (anti-oubli).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enum (idempotent pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.usage_banque AS ENUM ('principal', 'secondaire', 'paie', 'tva');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.banque — Comptes bancaires d'un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.banque (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id                uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                 uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  nom_banque                text,
  iban                      text NOT NULL,  -- ULTRA-SENSIBLE : chiffrer au repos (ADR 0013)
  bic                       text,
  devise                    text NOT NULL DEFAULT 'CHF',
  usage                     crm.usage_banque,
  actif                     boolean NOT NULL DEFAULT true,
  credentials_open_banking  jsonb,          -- ULTRA-SENSIBLE : chiffrer au repos (ADR 0013)
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  archived_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_banque_cabinet ON crm.banque (cabinet_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_banque_client  ON crm.banque (cabinet_id, client_id);

-- Exigence de chiffrement matérialisée en base (anti-oubli — voir ADR 0013).
COMMENT ON COLUMN crm.banque.iban IS
  'ULTRA-SENSIBLE — IBAN. Doit être chiffré au repos avant écriture (ADR 0013). Aucun chemin d''écriture en clair autorisé.';
COMMENT ON COLUMN crm.banque.credentials_open_banking IS
  'ULTRA-SENSIBLE — secrets Open Banking. Doivent être chiffrés au repos avant écriture (ADR 0013). Aucun chemin d''écriture en clair autorisé.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Trigger de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_banque ON crm.banque;
CREATE TRIGGER trg_check_client_cabinet_banque
  BEFORE INSERT OR UPDATE ON crm.banque
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.banque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.banque
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.banque
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.banque
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.banque
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
