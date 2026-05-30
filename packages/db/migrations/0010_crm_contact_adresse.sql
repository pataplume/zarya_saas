-- Migration 0010 : Fondation CRM — Bloc A2 (crm.contact + crm.adresse)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §6 et §7.
-- Forward-only, purement additif : deux nouvelles tables, aucun changement sur
-- l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé sur chaque table pour
-- la RLS ; sa cohérence avec client.cabinet_id est garantie par le trigger maison
-- fn_check_client_cabinet (réutilisé, défini en 0005). RLS activée + 4 policies
-- génériques par table via current_cabinet_id() (le service_role bypasse).
--
-- Divergence ASSUMÉE vs crm-schema.md §7 (adresse) : on ajoute created_at /
-- updated_at / archived_at, conformément à la convention db/CLAUDE.md §2 (toute
-- table métier porte ces timestamps + soft delete). Le doc §7 ne les listait pas.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enum type d'adresse (idempotent pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.type_adresse AS ENUM ('postale', 'facturation', 'siege');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.contact — Personnes de contact d'un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  prenom          text,
  nom             text NOT NULL,
  role            text,  -- "Dirigeant", "Comptable", "RH"… (texte libre)
  est_principal   boolean NOT NULL DEFAULT false,
  est_contact_rh  boolean NOT NULL DEFAULT false,
  est_signataire  boolean NOT NULL DEFAULT false,
  email           text,
  telephone       text,
  langue          crm.langue,  -- NULL ⇒ hérite de la langue du client
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contact_cabinet ON crm.contact (cabinet_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_contact_client  ON crm.contact (cabinet_id, client_id);

-- Au plus 1 contact principal par client (les contacts archivés ne comptent pas).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contact_principal_per_client
  ON crm.contact (client_id)
  WHERE est_principal AND archived_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.adresse — Adresses (postale / facturation / siège) d'un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.adresse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  type            crm.type_adresse NOT NULL,
  rue             text,
  complement      text,
  code_postal     text,
  ville           text,
  canton          text,  -- canton suisse (ex. "VD", "GE")
  pays            text NOT NULL DEFAULT 'CH',  -- ISO 3166-1 alpha-2
  est_principale  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_adresse_cabinet ON crm.adresse (cabinet_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_adresse_client  ON crm.adresse (cabinet_id, client_id);

-- Au plus 1 adresse principale par client (les adresses archivées ne comptent pas).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_adresse_principale_per_client
  ON crm.adresse (client_id)
  WHERE est_principale AND archived_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Triggers de cohérence cabinet/client (multi-tenant.md §7 — sécurité)
-- Réutilise crm.fn_check_client_cabinet (définie en 0005) : empêche de rattacher
-- un contact/une adresse à un client d'un AUTRE cabinet.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_contact ON crm.contact;
CREATE TRIGGER trg_check_client_cabinet_contact
  BEFORE INSERT OR UPDATE ON crm.contact
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

DROP TRIGGER IF EXISTS trg_check_client_cabinet_adresse ON crm.adresse;
CREATE TRIGGER trg_check_client_cabinet_adresse
  BEFORE INSERT OR UPDATE ON crm.adresse
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — isolation multi-tenant (4 policies génériques par table)
-- Pattern maison (cf. 0004/0005) via current_cabinet_id(). Le service_role bypasse.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.contact ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.contact
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.contact
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.contact
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.contact
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.adresse ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.adresse
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.adresse
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.adresse
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.adresse
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- Les nouvelles tables crm.* héritent automatiquement des droits authenticated.
-- ════════════════════════════════════════════════════════════════════════════
