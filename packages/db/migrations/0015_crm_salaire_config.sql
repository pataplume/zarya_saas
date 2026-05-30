-- Migration 0015 : Fondation CRM — Bloc A7 (crm.salaire_config)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §14.
-- Forward-only, purement additif : une nouvelle table, aucun changement sur l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé ; cohérence avec
-- client.cabinet_id garantie par fn_check_client_cabinet (réutilisé, défini en
-- 0005). RLS activée + 4 policies génériques via current_cabinet_id().
--
-- Notes :
--   - 1-1 avec le client (client_id = PK), rempli si service salaires actif.
--   - `contact_rh_id` est une vraie FK vers crm.contact (ON DELETE SET NULL) : le
--     contact RH appartient au même client donc au même cabinet ; la cohérence est
--     garantie applicativement et vérifiée en test (pas de trigger dédié).
--   - created_at/updated_at ajoutés (convention db/CLAUDE.md §2). Pas d'archived_at :
--     table de config 1-1 (cycle de vie aligné sur le client).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.frequence_paie AS ENUM ('mensuelle', 'quinzomadaire', 'hebdomadaire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.logiciel_paie AS ENUM (
    'bexio_payroll', 'cresus_salaires', 'winbiz_salaires', 'abacus_lohn',
    'officemaker_staff', 'swissdec', 'autre', 'aucun'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.salaire_config — Paramétrage salaires d'un client (1-1, client_id = PK)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.salaire_config (
  client_id                       uuid PRIMARY KEY REFERENCES crm.client(id) ON DELETE RESTRICT,
  cabinet_id                      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  nombre_employes                 integer,
  frequence_paie                  crm.frequence_paie NOT NULL DEFAULT 'mensuelle',
  date_validation_jour_du_mois    integer,
  contact_rh_id                   uuid REFERENCES crm.contact(id) ON DELETE SET NULL,
  logiciel_paie                   crm.logiciel_paie,
  caisse_avs                      text,
  caisse_lpp                      text,
  assurance_accidents             text,
  assurance_ijm                   text,
  documents_attendus_par_periode  jsonb,
  envoi_automatique_relance       boolean NOT NULL DEFAULT false,
  derniere_validation_recue       date,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salaire_config_cabinet     ON crm.salaire_config (cabinet_id);
CREATE INDEX IF NOT EXISTS idx_salaire_config_contact_rh  ON crm.salaire_config (contact_rh_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Trigger de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_salaire_config ON crm.salaire_config;
CREATE TRIGGER trg_check_client_cabinet_salaire_config
  BEFORE INSERT OR UPDATE ON crm.salaire_config
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.salaire_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.salaire_config
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.salaire_config
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.salaire_config
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.salaire_config
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
