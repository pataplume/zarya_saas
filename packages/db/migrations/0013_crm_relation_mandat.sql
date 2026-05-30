-- Migration 0013 : Fondation CRM — Bloc A5 (crm.relation + crm.mandat)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §8 et §9.
-- Forward-only, purement additif : deux nouvelles tables, aucun changement sur
-- l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé ; cohérence avec
-- client.cabinet_id garantie par fn_check_client_cabinet (réutilisé, défini en
-- 0005). RLS activée + 4 policies génériques par table via current_cabinet_id().
--
-- Notes :
--   - §8 crm.relation : 1-1 strict avec le client (client_id = PK). `iban_facturation`
--     est un IBAN → SENSIBLE : tout écriture DOIT chiffrer via Supabase Vault (aucun
--     chemin d'écriture n'existe encore).
--   - §9 crm.mandat : `document_id` est une vraie FK vers doc.document (ON DELETE
--     SET NULL) déclarée ici en SQL. Elle n'est pas modélisée côté Drizzle pour
--     éviter l'import circulaire crm ↔ doc (doc importe déjà crm.client/cabinet).
--   - created_at/updated_at ajoutés aux deux tables (convention db/CLAUDE.md §2).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.honoraires_modele AS ENUM ('forfait', 'regie', 'mixte');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.statut_mandat AS ENUM ('actif', 'expire', 'resilie');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.relation — Relation contractuelle cabinet ↔ client (1-1, client_id = PK)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.relation (
  client_id               uuid PRIMARY KEY REFERENCES crm.client(id) ON DELETE RESTRICT,
  cabinet_id              uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  pack_tarifaire          text,
  honoraires_mensuels     numeric(10,2),
  honoraires_modele       crm.honoraires_modele,
  date_signature          date,
  date_renouvellement     date,
  duree_engagement_mois   integer,
  notes_facturation       text,
  iban_facturation        text,  -- SENSIBLE : chiffrer via Vault à l'écriture
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relation_cabinet ON crm.relation (cabinet_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.mandat — Mandat contractuel versionné
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.mandat (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id         uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id          uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  version            integer NOT NULL DEFAULT 1,
  date_signature     date NOT NULL,
  date_effet         date NOT NULL,
  date_fin           date,
  document_id        uuid REFERENCES doc.document(id) ON DELETE SET NULL,
  services_couverts  text[],
  signataires        jsonb,
  statut             crm.statut_mandat NOT NULL DEFAULT 'actif',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  archived_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mandat_cabinet ON crm.mandat (cabinet_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_mandat_client  ON crm.mandat (cabinet_id, client_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Triggers de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_relation ON crm.relation;
CREATE TRIGGER trg_check_client_cabinet_relation
  BEFORE INSERT OR UPDATE ON crm.relation
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

DROP TRIGGER IF EXISTS trg_check_client_cabinet_mandat ON crm.mandat;
CREATE TRIGGER trg_check_client_cabinet_mandat
  BEFORE INSERT OR UPDATE ON crm.mandat
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — isolation multi-tenant (4 policies génériques par table)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.relation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.relation
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.relation
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.relation
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.relation
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.mandat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.mandat
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.mandat
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.mandat
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.mandat
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
