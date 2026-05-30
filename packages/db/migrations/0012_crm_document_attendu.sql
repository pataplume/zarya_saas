-- Migration 0012 : Fondation CRM — Bloc A4 (crm.document_attendu + reconnexion FK)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §13.
-- Forward-only. Deux volets :
--   1. Purement additif : nouvelle table crm.document_attendu (+ enums, index, RLS,
--      trigger de cohérence cabinet/client réutilisant fn_check_client_cabinet).
--   2. Reconnexion des « FK fantômes » : des colonnes uuid posées sans contrainte
--      dans crm.echeance / crm.relance (cibles différées) deviennent de vraies FK,
--      maintenant que crm.service (A3), crm.contact (A2) et crm.document_attendu (A4)
--      existent. Non-breaking : ces colonnes n'ont jamais été peuplées (aucun chemin
--      d'écriture ne les remplit encore) → toutes NULL → ADD CONSTRAINT valide propre.
--
-- Divergence ASSUMÉE vs crm-schema.md §13 : `frequence` réutilise l'enum
-- crm.frequence_service (valeurs identiques) plutôt qu'un doublon dédié.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.categorie_doc_attendu AS ENUM
    ('bancaire', 'fiscal', 'salaire', 'commercial', 'administratif');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.statut_periode_doc AS ENUM
    ('recu', 'manquant', 'en_retard', 'non_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.document_attendu — Documents périodiques attendus d'un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.document_attendu (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id                    uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                     uuid NOT NULL REFERENCES crm.client(id)  ON DELETE RESTRICT,
  service_id                    uuid REFERENCES crm.service(id) ON DELETE SET NULL,
  type_document                 text NOT NULL,
  categorie                     crm.categorie_doc_attendu,
  frequence                     crm.frequence_service NOT NULL,
  obligatoire                   boolean NOT NULL DEFAULT true,
  deadline_jours_apres_periode  integer,
  derniere_reception            date,
  derniere_periode_recue        text,
  statut_periode_courante       crm.statut_periode_doc,
  non_applicable_motif          text,
  actif                         boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  archived_at                   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_document_attendu_statut
  ON crm.document_attendu (cabinet_id, client_id, statut_periode_courante);
CREATE INDEX IF NOT EXISTS idx_document_attendu_reception
  ON crm.document_attendu (derniere_reception);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Trigger de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet, 0005)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_document_attendu ON crm.document_attendu;
CREATE TRIGGER trg_check_client_cabinet_document_attendu
  BEFORE INSERT OR UPDATE ON crm.document_attendu
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS — isolation multi-tenant (4 policies génériques)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.document_attendu ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.document_attendu
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.document_attendu
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.document_attendu
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.document_attendu
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Reconnexion des FK fantômes (colonnes uuid existantes → vraies FK)
-- Idempotent via DO blocks (ADD CONSTRAINT n'a pas de IF NOT EXISTS portable).
-- ON DELETE SET NULL : la suppression de la cible ne casse pas l'échéance/relance.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE crm.echeance
    ADD CONSTRAINT echeance_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES crm.service(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm.relance
    ADD CONSTRAINT relance_document_attendu_id_fkey
    FOREIGN KEY (document_attendu_id) REFERENCES crm.document_attendu(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm.relance
    ADD CONSTRAINT relance_destinataire_contact_id_fkey
    FOREIGN KEY (destinataire_contact_id) REFERENCES crm.contact(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note : crm.echeance.documents_requis (uuid[]) reste sans FK — Postgres ne supporte
-- pas de contrainte FK sur les éléments d'un tableau. Intégrité applicative.

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
