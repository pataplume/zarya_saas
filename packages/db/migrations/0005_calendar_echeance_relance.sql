-- Migration 0005 : Module Calendar — Run 1 (échéances & relances)
-- Crée : crm.echeance, crm.relance (+ enums) + triggers de cohérence
-- cabinet/client + RLS multi-tenant. Forward-only, purement additif.
--
-- Périmètre (ADR 0011) : tables opérationnelles de base uniquement. Différés :
--   - calendar.* (template_echeance, cabinet_config, pause_client, evenement_outlook) → Run 2/7
--   - colonnes d'extension Outlook / escalade / pipeline d'envoi → Runs 3/5/6/7
--   - FK vers tables non encore créées (crm.service, crm.document_attendu,
--     crm.contact, calendar.template_echeance, doc.email_brut) → uuid simple.
--
-- Multi-tenant strict (ADR 0005) — isolation par cabinet_id via current_cabinet_id().
-- Migration écrite à la main (pattern existant des migrations RLS/grants, cf. 0004).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE crm.type_echeance AS ENUM (
  'fiscale', 'tva', 'bouclement', 'salaire', 'relance_documents', 'personnalisee'
);

CREATE TYPE crm.statut_echeance AS ENUM (
  'a_venir', 'imminente', 'en_retard', 'traitee', 'reportee', 'annulee'
);

CREATE TYPE crm.canal_relance AS ENUM (
  'email', 'telephone', 'sms', 'dashboard'
);

CREATE TYPE crm.statut_relance AS ENUM (
  'brouillon', 'envoyee', 'lue', 'repondue', 'sans_reponse'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.echeance — Échéances fiscales/sociales par client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE crm.echeance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id        uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id         uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  service_id        uuid,  -- crm.service différé (Phase 4+), pas de FK
  template_id       uuid,  -- calendar.template_echeance différé (Run 2), pas de FK
  type              crm.type_echeance NOT NULL,
  libelle           text NOT NULL,
  date_echeance     date NOT NULL,
  date_alerte       date,
  statut            crm.statut_echeance NOT NULL DEFAULT 'a_venir',
  date_traitement   date,
  reporte_a         date,
  motif_report      text,
  documents_requis  uuid[],  -- crm.document_attendu différé (Phase 4+), pas de FK
  created_by        uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz
);

CREATE INDEX idx_echeance_client ON crm.echeance (cabinet_id, client_id, date_echeance);
CREATE INDEX idx_echeance_statut ON crm.echeance (cabinet_id, statut, date_echeance);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.relance — Relances clients liées à une échéance / un document
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE crm.relance (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id               uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  echeance_id              uuid REFERENCES crm.echeance(id) ON DELETE SET NULL,
  document_attendu_id      uuid,  -- crm.document_attendu différé (Phase 4+), pas de FK
  canal                    crm.canal_relance NOT NULL DEFAULT 'email',
  destinataire_contact_id  uuid,  -- crm.contact différé (Phase 4+), pas de FK
  date_envoi               timestamptz,
  sujet                    text,
  corps                    text,
  statut                   crm.statut_relance NOT NULL DEFAULT 'brouillon',
  reponse_recue_le         timestamptz,
  validee_par              uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL,
  numero_dans_serie        integer,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_relance_echeance ON crm.relance (echeance_id);
CREATE INDEX idx_relance_client ON crm.relance (cabinet_id, client_id);
CREATE INDEX idx_relance_statut ON crm.relance (cabinet_id, statut);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger de cohérence cabinet/client (multi-tenant.md § 7 — sécurité)
-- Empêche de rattacher un client d'un autre cabinet à une échéance / relance.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crm.fn_check_client_cabinet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    IF (SELECT cabinet_id FROM crm.client WHERE id = NEW.client_id) IS DISTINCT FROM NEW.cabinet_id THEN
      RAISE EXCEPTION 'Incohérence cabinet/client : le client % n''appartient pas au cabinet %',
        NEW.client_id, NEW.cabinet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_client_cabinet_echeance
  BEFORE INSERT OR UPDATE ON crm.echeance
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

CREATE TRIGGER trg_check_client_cabinet_relance
  BEFORE INSERT OR UPDATE ON crm.relance
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — isolation multi-tenant (4 policies génériques par table)
-- Pattern maison (cf. 0004) via current_cabinet_id(). Le service_role bypasse.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.echeance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.echeance
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.echeance
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.echeance
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.echeance
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.relance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.relance
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.relance
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.relance
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.relance
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (migration 0003).
-- Les nouvelles tables crm.* héritent automatiquement des droits authenticated.
-- ════════════════════════════════════════════════════════════════════════════
