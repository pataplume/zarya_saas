-- Migration 0025 : Bloc D2 — audit.api_externe (journal des appels API tierces)
-- Réf : ADR 0012 (séquence — Bloc D), docs/architecture/security-and-audit.md §8
-- (tables d'audit append-only, conservation 6 ans) + §14.3 (APIs sortantes),
-- packages/integrations/CLAUDE.md §2 (« tout appel API externe loggué dans
-- audit.api_externe »). Forward-only, purement additif.
--
-- PREMIÈRE ouverture du schéma `audit.*`. Par « minimum demandé » (CLAUDE.md), on ne
-- crée QUE la table requise par D2 — pas les 5 tables listées §8.2 (connexion,
-- acces_donnee_sensible, export, modification_permission seront posées à leurs blocs).
--
-- Multi-tenant strict (ADR 0005) : `cabinet_id NOT NULL`. PAS de `client_id` (un appel
-- API tierce appartient au CABINET) → aucun trigger de cohérence client/cabinet.
-- RLS activée (SELECT/INSERT scopés current_cabinet_id()). Le `db` applicatif (service
-- role) contourne la RLS : l'isolation du chemin app repose sur le filtre cabinet_id
-- discipliné + le test anti-fuite (cf. ADR 0005 addendum).
--
-- APPEND-ONLY (§8.4) : aucune UPDATE/DELETE possible. Garanti à DEUX niveaux :
--   1. REVOKE UPDATE, DELETE (rôles applicatifs) ;
--   2. trigger BEFORE UPDATE OR DELETE qui lève — bloque MÊME le service role
--      (défense en profondeur ; un superuser ne contourne pas un trigger).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Schéma audit
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS audit;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. audit.api_externe — un appel sortant vers une API tierce
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit.api_externe (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id   uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  -- Fournisseur logique (cross-intégration) : 'microsoft_graph', à terme 'bexio',
  -- 'zefix', 'infomaniak'… Texte (et non enum) pour éviter une migration par provider.
  provider     text NOT NULL,
  -- Chemin appelé, normalisé SANS identifiants ni secret (ex. '/me/messages').
  endpoint     text NOT NULL,
  method       text NOT NULL,
  -- NULL si l'appel n'a jamais obtenu de réponse (échec réseau / timeout).
  status_code  integer,
  -- Succès logique de l'appel (2xx ET pas d'erreur applicative).
  ok           boolean NOT NULL,
  -- Code d'erreur typé côté wrapper (MicrosoftErrorCode…) quand ok = false.
  error_code   text,
  latency_ms   integer NOT NULL,
  -- Acteur §8.3 : 'systeme' (webhook/job), 'cabinet_membre' (action UI), etc.
  acteur_type  text,
  acteur_id    uuid,
  -- Contexte NON sensible uniquement (nb d'items, tentatives, retry_after…).
  -- JAMAIS de token, corps de message, ni donnée client en clair (CLAUDE.md §2).
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Consultation cabinet (§8.5) : par cabinet, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_api_externe_cabinet_date
  ON audit.api_externe (cabinet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_externe_cabinet_provider
  ON audit.api_externe (cabinet_id, provider, created_at DESC);

COMMENT ON TABLE audit.api_externe IS
  'Journal append-only de tous les appels API tierces sortants (Microsoft Graph, etc.). '
  'Conservation 6 ans (obligation fiduciaire CH). Aucune UPDATE/DELETE (security-and-audit §8.4).';
COMMENT ON COLUMN audit.api_externe.metadata IS
  'Contexte NON sensible uniquement (nb items, tentatives, retry_after). Interdit d''y '
  'écrire un token, un corps de message ou une donnée client en clair (CLAUDE.md §2).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Append-only — trigger qui interdit UPDATE et DELETE (même service role)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION audit.fn_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit.% est append-only : % interdit (security-and-audit §8.4)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_api_externe_append_only ON audit.api_externe;
CREATE TRIGGER trg_api_externe_append_only
  BEFORE UPDATE OR DELETE ON audit.api_externe
  FOR EACH ROW EXECUTE FUNCTION audit.fn_append_only();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (SELECT + INSERT uniquement ; pas d'UPDATE/DELETE)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE audit.api_externe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON audit.api_externe
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON audit.api_externe
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grants — schéma audit nouveau (calqué sur 0003_grants_authenticated.sql),
--    mais SANS UPDATE/DELETE (append-only).
-- ════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA audit TO authenticated, anon, service_role;
GRANT SELECT, INSERT ON audit.api_externe TO authenticated;
GRANT SELECT, INSERT ON audit.api_externe TO service_role;
REVOKE UPDATE, DELETE ON audit.api_externe FROM authenticated, anon, PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO authenticated;
