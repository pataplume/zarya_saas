-- Migration 0016 : Fondation CRM — Bloc A8 (crm.risque, crm.evenement, crm.note)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §17/§18/§19.
-- Forward-only, purement additif : trois nouvelles tables, aucun changement sur l'existant.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id dénormalisé sur les trois tables ;
-- cohérence avec client.cabinet_id garantie par fn_check_client_cabinet (réutilisé,
-- défini en 0005). RLS activée + 4 policies génériques via current_cabinet_id().
--
-- Notes :
--   - crm.risque : 1-1 avec le client (client_id = PK), score 0-100 + niveau synthétique.
--   - crm.evenement : journal append-only. client_id NULLABLE (événement cabinet-level) ;
--     le trigger réutilise fn_check_client_cabinet qui tolère client_id NULL
--     (`IF NEW.client_id IS NOT NULL`). « Append-only » = convention applicative (la table
--     reste physiquement mutable, requis pour le cleanup des tests). Pas d'updated_at /
--     archived_at. acteur_id sans FK (polymorphe selon acteur_type) — intégrité applicative.
--   - crm.note : auteur_id FK vers crm.cabinet_membre (ON DELETE SET NULL) ; contenu Markdown.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Enums (idempotents pour rejouabilité manuelle)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE crm.niveau_risque AS ENUM ('ok', 'surveillance', 'critique');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.type_evenement AS ENUM (
    'document_recu', 'document_classe', 'relance_envoyee', 'echeance_creee',
    'service_active', 'note_ajoutee', 'mandat_signe', 'anomalie_facture',
    'score_recalcule', 'cabinet_membre_ajoute', 'integration_configuree'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.acteur_type_evenement AS ENUM (
    'cabinet_membre', 'client_contact', 'systeme', 'ia'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.visibilite_note AS ENUM ('cabinet', 'responsable_seul');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.risque — Score & niveau de risque d'un client (1-1, client_id = PK)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.risque (
  client_id          uuid PRIMARY KEY REFERENCES crm.client(id) ON DELETE RESTRICT,
  cabinet_id         uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  score              integer NOT NULL DEFAULT 0,
  niveau             crm.niveau_risque,
  facteurs           jsonb,
  drapeau_critique   boolean NOT NULL DEFAULT false,
  drapeau_motif      text,
  derniere_activite  timestamptz,
  dernier_calcul     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risque_cabinet ON crm.risque (cabinet_id, niveau);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.evenement — Journal d'activité append-only (client_id NULLABLE)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.evenement (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id       uuid REFERENCES crm.client(id) ON DELETE RESTRICT,
  type            crm.type_evenement NOT NULL,
  acteur_type     crm.acteur_type_evenement,
  acteur_id       uuid,
  ressource_type  text,
  ressource_id    uuid,
  description     text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evenement_client ON crm.evenement (cabinet_id, client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evenement_type   ON crm.evenement (cabinet_id, type);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. crm.note — Notes internes du cabinet sur un client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.note (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id   uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id    uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  auteur_id    uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL,
  contenu      text NOT NULL,
  epingle      boolean NOT NULL DEFAULT false,
  visibilite   crm.visibilite_note NOT NULL DEFAULT 'cabinet',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_note_client ON crm.note (cabinet_id, client_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_note_epingle ON crm.note (cabinet_id, client_id)
  WHERE epingle AND archived_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Triggers de cohérence cabinet/client (réutilisent crm.fn_check_client_cabinet)
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_check_client_cabinet_risque ON crm.risque;
CREATE TRIGGER trg_check_client_cabinet_risque
  BEFORE INSERT OR UPDATE ON crm.risque
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- evenement : client_id peut être NULL (événement cabinet-level) ; fn_check_client_cabinet
-- court-circuite via `IF NEW.client_id IS NOT NULL`.
DROP TRIGGER IF EXISTS trg_check_client_cabinet_evenement ON crm.evenement;
CREATE TRIGGER trg_check_client_cabinet_evenement
  BEFORE INSERT OR UPDATE ON crm.evenement
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

DROP TRIGGER IF EXISTS trg_check_client_cabinet_note ON crm.note;
CREATE TRIGGER trg_check_client_cabinet_note
  BEFORE INSERT OR UPDATE ON crm.note
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS — isolation multi-tenant (4 policies génériques par table)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.risque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.risque
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.risque
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.risque
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.risque
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.evenement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.evenement
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.evenement
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.evenement
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.evenement
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE crm.note ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON crm.note
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON crm.note
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON crm.note
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON crm.note
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Grants — couverts par les ALTER DEFAULT PRIVILEGES du schéma crm (0003).
-- ════════════════════════════════════════════════════════════════════════════
