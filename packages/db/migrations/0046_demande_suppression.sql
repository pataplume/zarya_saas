-- Run I1 — Demande de suppression de compte (RGPD / nLPD, droits-personnes.md §2.3/§4).
-- Table métier : enregistre une demande de suppression (cabinet ou client) traitée par le
-- DPO selon le process documenté (soft-delete → anonymisation PII → conservation audit 6 ans
-- / comptable 10 ans). L'effacement effectif reste un process DPO hors application.
-- DoD : cabinet_id NOT NULL + trigger cohérence client/cabinet + RLS 4 policies.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enum statut
-- ════════════════════════════════════════════════════════════════════════════
CREATE TYPE crm.statut_demande_suppression AS ENUM (
  'nouvelle', 'en_cours', 'traitee', 'rejetee'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Table — cabinet_id NOT NULL ; client_id NULL (renseigné si cible = 'client')
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE crm.demande_suppression (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id         uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  cible              text NOT NULL CHECK (cible IN ('cabinet', 'client')),
  client_id          uuid REFERENCES crm.client(id) ON DELETE RESTRICT,
  demandeur_user_id  uuid,
  demandeur_email    text,
  motif              text,
  statut             crm.statut_demande_suppression NOT NULL DEFAULT 'nouvelle',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Une demande 'client' référence forcément un client ; une demande 'cabinet' non.
  CONSTRAINT chk_demande_suppression_cible_client
    CHECK ((cible = 'client' AND client_id IS NOT NULL) OR cible = 'cabinet')
);

CREATE INDEX idx_demande_suppression_cabinet
  ON crm.demande_suppression (cabinet_id, statut);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Trigger cohérence cabinet/client (multi-tenant.md §7 ; fonction créée en 0005)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TRIGGER trg_check_client_cabinet_demande_suppression
  BEFORE INSERT OR UPDATE ON crm.demande_suppression
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE crm.demande_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.demande_suppression
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.demande_suppression
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.demande_suppression
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.demande_suppression
  FOR DELETE USING (cabinet_id = current_cabinet_id());
