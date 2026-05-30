-- Migration 0024 : Bloc D1 — crm.cabinet_integration (intégrations OAuth tierces)
-- Réf : ADR 0012 (séquence — Bloc D), ADR 0016 (séquencement C/D), ADR 0013 +
-- son ADDENDUM 2026-05-30 (mécanisme de chiffrement des tokens = Supabase Vault),
-- docs/architecture/microsoft-integration.md §3.2.
-- Forward-only, purement additif : une nouvelle table métier, aucun changement sur
-- l'existant.
--
-- Multi-tenant strict (ADR 0005) : `cabinet_id NOT NULL`. PAS de `client_id` (une
-- intégration appartient au CABINET, pas à un client) → aucun trigger de cohérence
-- client/cabinet nécessaire. RLS activée + 4 policies génériques via
-- current_cabinet_id() (DoD table métier).
--
-- ⚠️ SÉCURITÉ (ADR 0013 + addendum) : c'est le 1er write-path réel vers une donnée
-- ultra-sensible (tokens OAuth Microsoft). Le chiffrement au repos est donc câblé
-- MAINTENANT (et non différé). Modèle anti-clair : la table ne contient AUCUNE
-- colonne de token en clair. Le couple {access_token, refresh_token, …} est stocké
-- dans Supabase Vault via vault.create_secret() ; seul l'UUID du secret
-- (`vault_secret_id`) vit dans la ligne. Lecture via vault.decrypted_secrets
-- (service role serveur uniquement). Les données NON sensibles (tenant_id, UPN,
-- région, expires_at, scope, statut) vivent dans `parametres jsonb` en clair.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Vault : extension requise pour le chiffrement au repos des tokens
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  -- Extensible : 'bexio', 'nas'… s'ajouteront à leurs blocs respectifs.
  CREATE TYPE crm.integration_provider AS ENUM ('microsoft_graph');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.integration_statut AS ENUM ('en_attente', 'actif', 'revoque', 'erreur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.cabinet_integration — credentials d'intégration tierce par cabinet
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.cabinet_integration (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id       uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  provider         crm.integration_provider NOT NULL,
  -- UUID du secret Vault portant les tokens (NULL tant que le 1er échange OAuth
  -- n'a pas eu lieu). JAMAIS de token en clair ici (ADR 0013 addendum).
  vault_secret_id  uuid,
  statut           crm.integration_statut NOT NULL DEFAULT 'en_attente',
  -- Données NON sensibles uniquement : tenant_id, user_principal_name, tenant_region,
  -- expires_at (ISO), scope. Aucune donnée sensible (cf. COMMENT).
  parametres       jsonb NOT NULL DEFAULT '{}'::jsonb,
  derniere_erreur  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz
);

-- Une intégration active par (cabinet, provider) — index unique partiel.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cabinet_integration_provider
  ON crm.cabinet_integration (cabinet_id, provider)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cabinet_integration_cabinet
  ON crm.cabinet_integration (cabinet_id, archived_at);

-- Exigences de sécurité matérialisées en base (anti-oubli — ADR 0013 addendum).
COMMENT ON COLUMN crm.cabinet_integration.vault_secret_id IS
  'ULTRA-SENSIBLE (indirection) — UUID du secret Supabase Vault contenant les tokens OAuth '
  '(access_token/refresh_token). Les tokens NE SONT JAMAIS stockés en clair dans cette table '
  '(ADR 0013 addendum). Déchiffrement via vault.decrypted_secrets, service role serveur uniquement.';
COMMENT ON COLUMN crm.cabinet_integration.parametres IS
  'Données NON sensibles uniquement (tenant_id, user_principal_name, tenant_region, expires_at, '
  'scope). Interdit d''y écrire un access_token / refresh_token / client_secret en clair.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.cabinet_integration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.cabinet_integration
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.cabinet_integration
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.cabinet_integration
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.cabinet_integration
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
