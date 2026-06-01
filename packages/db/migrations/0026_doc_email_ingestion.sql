-- Migration 0026 : Bloc D4a — ingestion email Microsoft Graph.
-- Réf : ADR 0012 (séquence — Bloc D), docs/architecture/microsoft-integration.md §4
-- (webhooks/subscriptions) + §6 (pipeline d'ingestion). Forward-only, additif.
--
-- Deux nouvelles tables métier (ADR 0005) : cabinet_id NOT NULL, PAS de client_id (au
-- moment de l'ingestion brute, le client n'est pas encore résolu — la classification
-- Doc fera le rattachement) → aucun trigger de cohérence client/cabinet. RLS 4 policies.
--
--   • doc.email_subscription : abonnements Graph (1+ par cabinet). Sert au renouvellement
--     (expiration 72h, D4c) et à l'authentification des notifications entrantes (D4b) via
--     un `client_state_secret` ALÉATOIRE (pas le cabinet_id en clair — anti-falsification).
--   • doc.email_brut : emails reçus (envelope + pointeur message_id). Le corps complet et
--     les pièces jointes sont re-fetchés au traitement. UNIQUE (cabinet_id, message_id) →
--     idempotence (une notification rejouée ne duplique pas).
--
-- D4a = SCHÉMA SEUL. La création/réception/renouvellement des subscriptions = D4b/D4c.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE doc.statut_email_brut AS ENUM ('recu', 'traite', 'ignore', 'erreur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc.statut_subscription AS ENUM ('active', 'expiree', 'revoquee', 'erreur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. doc.email_subscription — abonnements Microsoft Graph
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc.email_subscription (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id          uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  -- Identifiant de la subscription côté Microsoft Graph (globalement unique).
  subscription_id     text NOT NULL,
  resource            text NOT NULL,
  change_type         text NOT NULL DEFAULT 'created',
  -- Secret partagé renvoyé par Graph dans CHAQUE notification (clientState). Aléatoire,
  -- comparé à la réception pour authentifier l'appel. Pas le cabinet_id (devinable).
  client_state_secret text NOT NULL,
  expiration_at       timestamptz NOT NULL,
  statut              doc.statut_subscription NOT NULL DEFAULT 'active',
  derniere_erreur     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_subscription_graph_id
  ON doc.email_subscription (subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_subscription_cabinet
  ON doc.email_subscription (cabinet_id, archived_at);
-- Scan de renouvellement (D4c) : actives proches de l'expiration.
CREATE INDEX IF NOT EXISTS idx_email_subscription_expiration
  ON doc.email_subscription (expiration_at)
  WHERE archived_at IS NULL AND statut = 'active';

COMMENT ON COLUMN doc.email_subscription.client_state_secret IS
  'Secret partagé (aléatoire) renvoyé par Graph dans clientState à chaque notification. '
  'Comparé à la réception pour authentifier l''appel. Jamais le cabinet_id en clair.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. doc.email_brut — emails entrants (table d'ingestion)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doc.email_brut (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id           uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  -- Identifiant du message côté Graph (re-fetch du corps + pièces jointes au traitement).
  message_id           text NOT NULL,
  internet_message_id  text,
  -- Subscription Graph ayant livré le message (text, pas de FK : la subscription peut
  -- être archivée sans perdre l'email).
  subscription_id      text,
  subject              text,
  from_address         text,
  from_name            text,
  received_at          timestamptz,
  has_attachments      boolean NOT NULL DEFAULT false,
  body_preview         text,
  web_link             text,
  statut               doc.statut_email_brut NOT NULL DEFAULT 'recu',
  traite_at            timestamptz,
  erreur               text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz
);

-- Idempotence : une notification rejouée pour le même message ne crée pas de doublon.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_brut_message_per_cabinet
  ON doc.email_brut (cabinet_id, message_id);
-- File de traitement : par cabinet + statut.
CREATE INDEX IF NOT EXISTS idx_email_brut_cabinet_statut
  ON doc.email_brut (cabinet_id, statut, received_at);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques par table)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE doc.email_subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.email_subscription
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.email_subscription
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.email_subscription
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.email_subscription
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE doc.email_brut ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON doc.email_brut
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON doc.email_brut
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON doc.email_brut
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON doc.email_brut
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grants — explicites (doc a des ALTER DEFAULT PRIVILEGES en 0004, mais on les
--    pose aussi en clair : la migration peut être appliquée par un autre rôle).
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON doc.email_subscription TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON doc.email_brut TO authenticated;
