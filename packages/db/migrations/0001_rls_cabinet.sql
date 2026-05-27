-- ============================================================================
-- Migration : RLS + current_cabinet_id()
-- Appliqué manuellement (hors Drizzle Kit — RLS non géré par Drizzle)
-- Référence : /docs/architecture/multi-tenant.md § 5
-- ============================================================================

-- ─── Fonction current_cabinet_id() ───────────────────────────────────────────
-- Lit le cabinet_id depuis le JWT Supabase (app_metadata).
-- Utilisée par toutes les RLS policies des tables métier.
CREATE OR REPLACE FUNCTION current_cabinet_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'cabinet_id')::uuid;
$$;

-- ─── RLS sur crm.cabinet_membre ───────────────────────────────────────────────
-- crm.cabinet n'a pas de RLS (pas de cabinet_id sur elle-même).
-- L'accès est contrôlé via cabinet_membre + logique applicative.

ALTER TABLE crm.cabinet_membre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select"
  ON crm.cabinet_membre
  FOR SELECT
  USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_insert"
  ON crm.cabinet_membre
  FOR INSERT
  WITH CHECK (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_update"
  ON crm.cabinet_membre
  FOR UPDATE
  USING (cabinet_id = current_cabinet_id());

CREATE POLICY "tenant_isolation_delete"
  ON crm.cabinet_membre
  FOR DELETE
  USING (cabinet_id = current_cabinet_id());
