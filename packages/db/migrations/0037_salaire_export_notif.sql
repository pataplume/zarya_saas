-- ════════════════════════════════════════════════════════════════════════════
-- 0037 — Bloc G1b : export + notifications du cycle salaire (2e moitié du schéma).
--
-- Tables : format_export + mapping_export (CATALOGUES déclaratifs, cabinet_id NULL global +
-- override), export, notification, relance, piece (scopés période/client). Réf salaire-schema
-- §9/§11/§13/§14. Les seeds de formats (mappings logiciel-spécifiques) = G6.
--
-- Multi-tenant : cabinet_id + client_id dénormalisés sur les tables scopées (export/notification/
-- relance/piece) → crm.fn_check_client_cabinet. format_export/mapping_export = catalogues (RLS
-- lecture globale + override cabinet, pattern type_element_paie). RLS 4 policies.
-- Réf : docs/data-model/salaire-schema.md ; flow-e §7-10 ; KICKOFF G1.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE salaire.format_fichier_export AS ENUM ('csv', 'xlsx', 'xml', 'txt');
CREATE TYPE salaire.statut_export AS ENUM ('genere', 'telecharge', 'importe', 'erreur');
CREATE TYPE salaire.type_notification AS ENUM (
  'initiale', 'confirmation_validation', 'modification_fiduciaire', 'cloture'
);
CREATE TYPE salaire.statut_envoi_notif AS ENUM ('envoyee', 'echec', 'bounce');
CREATE TYPE salaire.langue_notif AS ENUM ('fr', 'de', 'it', 'en');
CREATE TYPE salaire.categorie_piece AS ENUM (
  'heures', 'absences', 'frais', 'contrat', 'medical', 'autre'
);
CREATE TYPE salaire.source_piece AS ENUM ('client_dashboard', 'fiduciaire_upload', 'email_client');

-- ─── salaire.format_export — CATALOGUE déclaratif des formats ────────────────
CREATE TABLE salaire.format_export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES crm.cabinet(id) ON DELETE CASCADE,
  code text NOT NULL,
  nom text NOT NULL,
  logiciel_cible salaire.logiciel_paie_cible NOT NULL,
  version text,
  format_fichier salaire.format_fichier_export NOT NULL,
  encodage text DEFAULT 'utf-8',
  separateur_csv text,
  date_format text,
  nombre_format text,
  actif boolean NOT NULL DEFAULT true,
  documentation_url text,
  notes_internes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_format_export_code
  ON salaire.format_export (COALESCE(cabinet_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- ─── salaire.mapping_export — traduction type élément ZARYA → champ cible ────
CREATE TABLE salaire.mapping_export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES crm.cabinet(id) ON DELETE CASCADE,
  format_export_id uuid NOT NULL REFERENCES salaire.format_export(id) ON DELETE CASCADE,
  type_element_id uuid REFERENCES salaire.type_element_paie(id) ON DELETE SET NULL,
  champ_zarya text,
  champ_cible text NOT NULL,
  transformation jsonb,
  obligatoire boolean NOT NULL DEFAULT false,
  valeur_par_defaut text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mapping_export_format ON salaire.mapping_export (format_export_id);

-- ─── salaire.export — fichier généré pour une période ───────────────────────
CREATE TABLE salaire.export (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  format_export_id uuid NOT NULL REFERENCES salaire.format_export(id) ON DELETE RESTRICT,
  logiciel_cible salaire.logiciel_paie_cible,
  fichier_id uuid REFERENCES doc.document(id) ON DELETE SET NULL,
  nom_fichier text,
  taille_octets bigint,
  nb_employes_inclus integer,
  nb_lignes_donnees integer,
  genere_par uuid NOT NULL,
  genere_le timestamptz NOT NULL DEFAULT now(),
  telecharge_le timestamptz,
  import_confirme boolean NOT NULL DEFAULT false,
  import_confirme_le timestamptz,
  import_confirme_par uuid,
  import_notes text,
  version_format text,
  statut salaire.statut_export NOT NULL DEFAULT 'genere',
  message_erreur text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_export_periode ON salaire.export (cabinet_id, periode_id);

-- ─── salaire.notification ───────────────────────────────────────────────────
CREATE TABLE salaire.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  type salaire.type_notification NOT NULL,
  destinataire_contact_id uuid REFERENCES crm.contact(id) ON DELETE SET NULL,
  destinataire_email text,
  sujet text,
  corps text,
  langue salaire.langue_notif,
  date_envoi timestamptz NOT NULL DEFAULT now(),
  statut_envoi salaire.statut_envoi_notif,
  envoyee_par uuid,
  graph_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_periode ON salaire.notification (cabinet_id, periode_id);

-- ─── salaire.relance ────────────────────────────────────────────────────────
CREATE TABLE salaire.relance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  destinataire_contact_id uuid REFERENCES crm.contact(id) ON DELETE SET NULL,
  sujet text,
  corps text,
  date_envoi timestamptz NOT NULL DEFAULT now(),
  envoyee_par uuid,
  auto_generated boolean NOT NULL DEFAULT false,
  valide_par_humain boolean NOT NULL DEFAULT false,
  graph_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_relance_periode ON salaire.relance (cabinet_id, periode_id);

-- ─── salaire.piece — pièces jointes libres ──────────────────────────────────
CREATE TABLE salaire.piece (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  employe_id uuid REFERENCES salaire.employe(id) ON DELETE SET NULL,
  type_libre text,
  categorie salaire.categorie_piece,
  document_id uuid NOT NULL REFERENCES doc.document(id) ON DELETE RESTRICT,
  source salaire.source_piece NOT NULL,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_piece_periode ON salaire.piece (cabinet_id, periode_id, employe_id);

-- ─── Triggers de cohérence (tables scopées avec client_id NOT NULL) ──────────
CREATE TRIGGER trg_check_client_cabinet_export
  BEFORE INSERT OR UPDATE ON salaire.export
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_notification
  BEFORE INSERT OR UPDATE ON salaire.notification
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_relance
  BEFORE INSERT OR UPDATE ON salaire.relance
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_piece
  BEFORE INSERT OR UPDATE ON salaire.piece
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ─── RLS — tables scopées cabinet ───────────────────────────────────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['export','notification','relance','piece']
  LOOP
    EXECUTE format('ALTER TABLE salaire.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON salaire.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON salaire.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON salaire.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON salaire.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- format_export + mapping_export : catalogues (global lisible + override cabinet).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['format_export','mapping_export']
  LOOP
    EXECUTE format('ALTER TABLE salaire.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "catalogue_select" ON salaire.%I FOR SELECT USING (cabinet_id IS NULL OR cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "catalogue_insert" ON salaire.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "catalogue_update" ON salaire.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "catalogue_delete" ON salaire.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA salaire TO authenticated;
