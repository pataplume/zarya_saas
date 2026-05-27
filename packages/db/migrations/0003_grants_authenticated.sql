-- Migration 0003 : Grants explicites sur le schéma crm pour le rôle authenticated
--
-- Contexte : Supabase crée le rôle `authenticated` pour PostgREST mais ne lui
-- accorde pas automatiquement les droits sur les schémas custom (hors `public`).
-- Ces GRANTs sont nécessaires pour que :
--   1. Les policies RLS sur crm.* s'appliquent via PostgREST
--   2. Les tests d'intégration (SET LOCAL ROLE authenticated) fonctionnent
--
-- Référence : tests/integration/helpers/rls.ts — queryAsTenant()

GRANT USAGE ON SCHEMA crm TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA crm TO authenticated;

-- Droits par défaut pour les futures tables créées dans crm
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT ALL ON SEQUENCES TO authenticated;
