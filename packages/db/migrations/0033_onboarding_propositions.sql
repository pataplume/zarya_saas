-- ════════════════════════════════════════════════════════════════════════════
-- 0033 — Bloc F6a : cluster propositions onboarding-client (référentiel employés IA).
--
-- Ouvre les 5 tables du pipeline d'extraction/validation des employés, différées de
-- F0 (FK NOT NULL → session_onboarding + extraction_ia, zéro-FK-fantôme) :
--   • salaire.session_onboarding  — 1 session par client, persistante
--   • salaire.upload_fichier      — fichiers uploadés (→ doc.document)
--   • salaire.extraction_ia       — 1 passe LLM sur un fichier (catégorie chat_large)
--   • salaire.proposition_employe — employé proposé, en attente de validation
--   • salaire.proposition_champ   — granularité champ-par-champ (ADR 0007)
-- + évolution additive de salaire.employe (traçabilité onboarding).
--
-- Multi-tenant (ADR 0005, précédent facture 0030) : cabinet_id NOT NULL + client_id
-- NOT NULL dénormalisés sur TOUTES les tables (la doc ne montre que session_id mais le
-- pattern ZARYA dénormalise client_id pour un trigger de cohérence uniforme) →
-- crm.fn_check_client_cabinet. RLS 4 policies génériques par table.
--
-- DÉCISIONS (arbitrées founder 2026-06-02) :
--   • Finalisation proposition→salaire.employe = APP-CODE (F6c), pas trigger DB : l'écriture
--     AVS/IBAN au Vault (ADR 0013) est impossible dans un trigger SQL pur. Seuls les triggers
--     de cohérence cabinet_id sont posés ici. (Addendum à la règle 4 CLAUDE.md = F6c.)
--   • proposition_employe.extraction_id NULLABLE : proposition issue d'une extraction IA
--     (non-null) OU d'une saisie manuelle (null) — les 3 modes upload/manuel/mixte.
--   • Parsing fichiers (.xlsx via exceljs + CSV natif) = F6b.
-- DIFFÉRÉ : salaire.template_mapping + upload_fichier.utilise_template_id (Phase 2, vide au
--   MVP) ; salaire.zefix_recherche (l'audit nLPD passe déjà par crm.zefix_recherche_cabinet,
--   F3) ; policy RLS additive client_contact (F8, lecture dashboard client) ; colonnes coût/
--   tokens invisibles client (masquées par les vues v_* en F8).
-- Réf : docs/data-model/onboarding-client-schema.md §2-12 ; ADR 0007/0010/0013 ; KICKOFF F6.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE salaire.statut_session_onboarding AS ENUM (
  'initialisee', 'etape_1_en_cours', 'etape_2_en_cours', 'etape_3_en_cours',
  'terminee', 'abandonnee'
);
CREATE TYPE salaire.statut_proposition_employe AS ENUM (
  'en_attente', 'validee', 'rejetee', 'fusionnee', 'echec_extraction'
);
CREATE TYPE salaire.statut_proposition_champ AS ENUM (
  'propose', 'valide', 'modifie', 'rejete', 'manquant'
);
CREATE TYPE salaire.type_source_upload AS ENUM (
  'excel_structure', 'excel_libre', 'csv', 'pdf_contrat', 'pdf_attestation',
  'image_scan', 'inconnu'
);
CREATE TYPE salaire.type_modele_extraction AS ENUM (
  'chat_large', 'chat_small', 'vision', 'autre'
);
CREATE TYPE salaire.statut_upload_extraction AS ENUM (
  'pending', 'en_cours', 'termine', 'echec'
);
CREATE TYPE salaire.statut_extraction_ia AS ENUM (
  'en_cours', 'succes', 'echec_partiel', 'echec_total'
);
CREATE TYPE salaire.categorie_champ AS ENUM (
  'identite', 'coordonnees', 'statut_admin', 'contrat', 'remuneration'
);
CREATE TYPE salaire.acteur_onboarding AS ENUM ('client', 'fiduciaire');

-- ─── salaire.session_onboarding — 1 session par client, persistante ──────────
CREATE TABLE salaire.session_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL UNIQUE REFERENCES crm.client(id) ON DELETE RESTRICT,
  statut salaire.statut_session_onboarding NOT NULL DEFAULT 'initialisee',
  date_demarrage timestamptz NOT NULL DEFAULT now(),
  date_derniere_activite timestamptz NOT NULL DEFAULT now(),
  date_fin timestamptz,
  etape_1_terminee_at timestamptz,
  etape_2_terminee_at timestamptz,
  etape_3a_terminee_at timestamptz,
  etape_3b_terminee_at timestamptz,
  nb_employes_attendus integer,
  nb_employes_proposes integer NOT NULL DEFAULT 0,
  nb_employes_valides integer NOT NULL DEFAULT 0,
  nb_uploads integer NOT NULL DEFAULT 0,
  consentement_zefix boolean NOT NULL DEFAULT false,
  consentement_zefix_at timestamptz,
  consentement_nlpd_traitement boolean NOT NULL DEFAULT false,
  consentement_nlpd_at timestamptz,
  dernier_acteur_type salaire.acteur_onboarding,
  dernier_acteur_id uuid,
  notes_client text,
  notes_fiduciaire text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_onboarding_relance
  ON salaire.session_onboarding (cabinet_id, statut, date_derniere_activite);

-- ─── salaire.upload_fichier — fichiers uploadés pendant l'onboarding ─────────
CREATE TABLE salaire.upload_fichier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES salaire.session_onboarding(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES doc.document(id) ON DELETE RESTRICT,
  nom_fichier_original text NOT NULL,
  taille_octets bigint,
  type_mime text,
  type_source_detecte salaire.type_source_upload,
  categorie_declaree text,
  uploaded_par_type salaire.acteur_onboarding NOT NULL,
  uploaded_par_id uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  statut_extraction salaire.statut_upload_extraction NOT NULL DEFAULT 'pending',
  date_extraction_demarree timestamptz,
  date_extraction_terminee timestamptz,
  message_erreur text,
  nb_employes_extraits integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_upload_fichier_session ON salaire.upload_fichier (cabinet_id, session_id, uploaded_at);
CREATE INDEX idx_upload_fichier_statut ON salaire.upload_fichier (cabinet_id, statut_extraction);

-- ─── salaire.extraction_ia — 1 passe LLM sur un fichier (audit + ré-extraction) ──
CREATE TABLE salaire.extraction_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  upload_fichier_id uuid NOT NULL REFERENCES salaire.upload_fichier(id) ON DELETE CASCADE,
  numero_passe integer NOT NULL DEFAULT 1,
  modele_utilise salaire.type_modele_extraction NOT NULL,
  modele_version_exacte text,
  prompt_version text,
  -- ID de requête Infomaniak pour cross-référence (ADR 0010 ; remplace bedrock_request_id).
  requete_externe_id text,
  donnees_brutes jsonb,
  nb_employes_detectes integer,
  confiance_globale numeric(3, 2),
  date_debut timestamptz NOT NULL DEFAULT now(),
  date_fin timestamptz,
  duree_ms integer,
  tokens_input integer,
  tokens_output integer,
  cout_estime_chf numeric(8, 4),
  statut salaire.statut_extraction_ia NOT NULL DEFAULT 'en_cours',
  message_erreur text,
  utilise_par_passe_suivante boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_extraction_ia_fichier ON salaire.extraction_ia (cabinet_id, upload_fichier_id, numero_passe DESC);

-- ─── salaire.proposition_employe — employé proposé, en attente de validation ──
CREATE TABLE salaire.proposition_employe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES salaire.session_onboarding(id) ON DELETE CASCADE,
  -- NULLABLE : extraction IA (non-null) OU saisie manuelle (null) — 3 modes onboarding.
  extraction_id uuid REFERENCES salaire.extraction_ia(id) ON DELETE SET NULL,
  numero_dans_extraction integer,
  statut salaire.statut_proposition_employe NOT NULL DEFAULT 'en_attente',
  confiance_globale numeric(3, 2),
  anomalies_detectees jsonb,
  doublons_potentiels uuid[],
  fusionnee_avec_id uuid REFERENCES salaire.proposition_employe(id) ON DELETE SET NULL,
  employe_id uuid UNIQUE REFERENCES salaire.employe(id) ON DELETE SET NULL,
  rejetee_motif text,
  sources_documents uuid[],
  date_validation timestamptz,
  valide_par_type salaire.acteur_onboarding,
  valide_par_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposition_employe_session ON salaire.proposition_employe (cabinet_id, session_id, statut);
CREATE INDEX idx_proposition_employe_employe ON salaire.proposition_employe (employe_id);

-- ─── salaire.proposition_champ — granularité champ-par-champ (ADR 0007) ──────
CREATE TABLE salaire.proposition_champ (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  proposition_employe_id uuid NOT NULL REFERENCES salaire.proposition_employe(id) ON DELETE CASCADE,
  nom_champ text NOT NULL,
  categorie salaire.categorie_champ,
  valeur_proposee text,
  valeur_proposee_normalisee jsonb,
  confiance numeric(3, 2) NOT NULL,
  source_document_id uuid REFERENCES doc.document(id) ON DELETE SET NULL,
  source_page integer,
  source_bbox jsonb,
  source_cellule text,
  source_texte_extrait text,
  obligatoire_swissdec boolean NOT NULL DEFAULT false,
  statut salaire.statut_proposition_champ NOT NULL DEFAULT 'propose',
  valeur_finale text,
  modifie_par_type salaire.acteur_onboarding,
  modifie_par_id uuid,
  date_validation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_proposition_champ UNIQUE (proposition_employe_id, nom_champ)
);
CREATE INDEX idx_proposition_champ_statut ON salaire.proposition_champ (proposition_employe_id, statut);
CREATE INDEX idx_proposition_champ_swissdec ON salaire.proposition_champ (proposition_employe_id, obligatoire_swissdec);

-- ─── Évolution additive de salaire.employe (traçabilité onboarding) ──────────
ALTER TABLE salaire.employe
  ADD COLUMN cree_via_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN session_onboarding_id uuid REFERENCES salaire.session_onboarding(id) ON DELETE SET NULL,
  ADD COLUMN proposition_employe_id uuid UNIQUE REFERENCES salaire.proposition_employe(id) ON DELETE SET NULL,
  ADD COLUMN documents_sources uuid[],
  ADD COLUMN confiance_globale_initiale numeric(3, 2),
  ADD COLUMN ids_externes jsonb,
  ADD COLUMN derniere_synchronisation jsonb;

-- ─── Triggers de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet) ──
CREATE TRIGGER trg_check_client_cabinet_session
  BEFORE INSERT OR UPDATE ON salaire.session_onboarding
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_upload
  BEFORE INSERT OR UPDATE ON salaire.upload_fichier
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_extraction
  BEFORE INSERT OR UPDATE ON salaire.extraction_ia
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_prop_employe
  BEFORE INSERT OR UPDATE ON salaire.proposition_employe
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_prop_champ
  BEFORE INSERT OR UPDATE ON salaire.proposition_champ
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ─── RLS — 4 policies génériques par table (current_cabinet_id()) ────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['session_onboarding','upload_fichier','extraction_ia','proposition_employe','proposition_champ']
  LOOP
    EXECUTE format('ALTER TABLE salaire.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON salaire.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON salaire.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON salaire.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON salaire.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- ─── Grants (les nouvelles tables doivent être explicitement grantées) ───────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA salaire TO authenticated;
