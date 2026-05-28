-- Migration 0002 — RLS + trigger provisioning onboarding fiduciaire
-- Application manuelle (hors Drizzle Kit)

-- ─── Trigger : provision automatique d'une session à la création d'un cabinet ──

CREATE OR REPLACE FUNCTION crm.provision_nouveau_cabinet()
RETURNS trigger AS $$
BEGIN
  -- Créer la session d'onboarding fiduciaire (1 par cabinet)
  INSERT INTO crm.session_onboarding_fiduciaire (cabinet_id, statut)
  VALUES (NEW.id, 'inscrit');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_provision_nouveau_cabinet
  AFTER INSERT ON crm.cabinet
  FOR EACH ROW EXECUTE FUNCTION crm.provision_nouveau_cabinet();

-- ─── RLS : session_onboarding_fiduciaire ──────────────────────────────────────

ALTER TABLE crm.session_onboarding_fiduciaire ENABLE ROW LEVEL SECURITY;

-- Isolation standard + cas bootstrap (JWT pas encore mis à jour après sign-up)
CREATE POLICY "tenant_isolation_select" ON crm.session_onboarding_fiduciaire
  FOR SELECT USING (
    cabinet_id = current_cabinet_id()
    OR cabinet_id IN (
      SELECT id FROM crm.cabinet WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "tenant_isolation_insert" ON crm.session_onboarding_fiduciaire
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_update" ON crm.session_onboarding_fiduciaire
  FOR UPDATE USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_delete" ON crm.session_onboarding_fiduciaire
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ─── RLS : invitation_membre ──────────────────────────────────────────────────

ALTER TABLE crm.invitation_membre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON crm.invitation_membre
  FOR SELECT USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_insert" ON crm.invitation_membre
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_update" ON crm.invitation_membre
  FOR UPDATE USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_delete" ON crm.invitation_membre
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ─── RLS : zefix_recherche_cabinet ───────────────────────────────────────────

ALTER TABLE crm.zefix_recherche_cabinet ENABLE ROW LEVEL SECURITY;

-- cabinet_id nullable → autoriser aussi via session_id → cabinet
CREATE POLICY "tenant_isolation_select" ON crm.zefix_recherche_cabinet
  FOR SELECT USING (
    cabinet_id = current_cabinet_id()
    OR cabinet_id IN (
      SELECT id FROM crm.cabinet WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "tenant_isolation_insert" ON crm.zefix_recherche_cabinet
  FOR INSERT WITH CHECK (
    cabinet_id = current_cabinet_id()
    OR cabinet_id IS NULL
  );

CREATE POLICY "tenant_isolation_update" ON crm.zefix_recherche_cabinet
  FOR UPDATE USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_delete" ON crm.zefix_recherche_cabinet
  FOR DELETE USING (cabinet_id = current_cabinet_id());
