-- ════════════════════════════════════════════════════════════════════════════
-- 0036 — Bloc G1a : cœur du cycle mensuel salaire (workflow, PAS de calcul de paie).
--
-- Tables du cycle : periode, type_element_paie (catalogue + seed standard), element_paie,
-- absence, changement, validation, evenement. (Export/notif = G1b, migration 0037.)
--
-- Multi-tenant (précédent facture 0030 / F6a) : cabinet_id NOT NULL + client_id dénormalisés
-- → crm.fn_check_client_cabinet. type_element_paie = CATALOGUE (cabinet_id NULL = global,
-- pattern calendar.template_echeance) : pas de client_id, RLS lecture globale + override cabinet.
-- evenement : append-only (client_id/periode_id nullables, comme crm.evenement). RLS 4 policies.
-- Réf : docs/data-model/salaire-schema.md §2/§4-10/§15 ; flow-e ; KICKOFF G1.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE salaire.statut_periode AS ENUM (
  'non_demandee', 'en_attente', 'relancee', 'validee', 'en_retard',
  'exportee', 'cloturee', 'non_applicable'
);
CREATE TYPE salaire.logiciel_paie_cible AS ENUM (
  'bexio_payroll', 'cresus_salaires', 'winbiz_salaires', 'abacus_lohn',
  'swiss21', 'banana', 'autre', 'aucun'
);
CREATE TYPE salaire.acteur_modif AS ENUM ('client', 'fiduciaire', 'systeme');
CREATE TYPE salaire.unite_element AS ENUM (
  'heures', 'jours', 'montant_chf', 'pourcentage', 'nombre', 'texte'
);
CREATE TYPE salaire.categorie_element AS ENUM (
  'temps_travail', 'prime', 'indemnite', 'retenue', 'frais', 'autre'
);
CREATE TYPE salaire.source_element AS ENUM (
  'pre_remplie', 'client_dashboard', 'fiduciaire_saisie', 'import_pj', 'ia_extraction'
);
CREATE TYPE salaire.type_absence AS ENUM (
  'maladie', 'accident_pro', 'accident_non_pro', 'maternite', 'paternite',
  'service_militaire', 'conge_non_paye', 'conge_paye', 'autre'
);
CREATE TYPE salaire.assurance_absence AS ENUM (
  'aucune', 'accident_lpp', 'accident_laanp', 'ijm', 'apg'
);
CREATE TYPE salaire.source_absence AS ENUM ('client_dashboard', 'fiduciaire_saisie', 'import_pj');
CREATE TYPE salaire.type_changement AS ENUM (
  'entree', 'sortie', 'changement_salaire', 'changement_taux', 'conge_non_paye',
  'maladie_longue', 'accident', 'maternite_paternite', 'service_militaire', 'autre'
);
CREATE TYPE salaire.source_changement AS ENUM (
  'client_dashboard', 'fiduciaire_saisie', 'ia_extraction'
);
CREATE TYPE salaire.valide_par_validation AS ENUM ('client', 'fiduciaire_pour_client');
CREATE TYPE salaire.methode_validation AS ENUM (
  'dashboard', 'email_reponse', 'email_avec_piece', 'confirmation_manuelle'
);
CREATE TYPE salaire.acteur_evenement AS ENUM (
  'humain_fiduciaire', 'humain_client', 'systeme', 'ia'
);
CREATE TYPE salaire.type_evenement AS ENUM (
  'periode_creee', 'periode_pre_remplie', 'notification_envoyee', 'relance_envoyee',
  'connexion_client_dashboard', 'element_paie_saisi', 'element_paie_modifie',
  'absence_declaree', 'changement_declare', 'changement_applique_referentiel',
  'employe_propose', 'employe_confirme', 'employe_sorti', 'piece_uploadee',
  'validation_recue_client', 'validation_par_fiduciaire', 'export_genere',
  'export_telecharge', 'import_confirme', 'periode_clotturee', 'periode_reouverte',
  'statut_modifie', 'note_ajoutee', 'connexion_client_echec'
);

-- ─── salaire.periode — 1 cycle mensuel par client ───────────────────────────
CREATE TABLE salaire.periode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  annee integer NOT NULL,
  mois integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  statut salaire.statut_periode NOT NULL DEFAULT 'non_demandee',
  date_notification_envoyee timestamptz,
  date_validation_recue timestamptz,
  date_export_genere timestamptz,
  date_import_confirme timestamptz,
  date_limite_validation date NOT NULL,
  date_cloture timestamptz,
  pre_remplie boolean NOT NULL DEFAULT false,
  pre_remplie_depuis uuid REFERENCES salaire.periode(id) ON DELETE SET NULL,
  derniere_modification_par salaire.acteur_modif,
  derniere_modification_acteur_id uuid,
  derniere_modification_at timestamptz,
  nb_employes_concernes integer NOT NULL DEFAULT 0,
  nb_changements_declares integer NOT NULL DEFAULT 0,
  sans_changement_declare boolean NOT NULL DEFAULT false,
  non_applicable boolean NOT NULL DEFAULT false,
  non_applicable_motif text,
  notes_internes_fiduciaire text,
  notes_client text,
  gestionnaire_id uuid,
  logiciel_paie_cible salaire.logiciel_paie_cible,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_periode_client_mois UNIQUE (client_id, annee, mois),
  CONSTRAINT chk_periode_limite CHECK (date_limite_validation >= make_date(annee, mois, 1))
);
CREATE INDEX idx_periode_statut ON salaire.periode (cabinet_id, statut, date_limite_validation);
CREATE INDEX idx_periode_client ON salaire.periode (cabinet_id, client_id, annee, mois);

-- ─── salaire.type_element_paie — CATALOGUE (global cabinet_id NULL + override) ─
CREATE TABLE salaire.type_element_paie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES crm.cabinet(id) ON DELETE CASCADE,
  code text NOT NULL,
  libelle_fr text NOT NULL,
  libelle_de text,
  libelle_it text,
  description_client text,
  unite salaire.unite_element NOT NULL,
  categorie salaire.categorie_element NOT NULL,
  recurrent boolean NOT NULL DEFAULT false,
  visible_client boolean NOT NULL DEFAULT true,
  ordre_affichage integer NOT NULL DEFAULT 100,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_type_element_code
  ON salaire.type_element_paie (COALESCE(cabinet_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- Seed des types standard ZARYA (cabinet_id NULL = globaux). salaire-schema.md §5.
INSERT INTO salaire.type_element_paie (cabinet_id, code, libelle_fr, unite, categorie, recurrent, ordre_affichage) VALUES
  (NULL, 'HEURES_NORMALES',     'Heures normales',          'heures',      'temps_travail', true,  10),
  (NULL, 'HEURES_SUP',          'Heures supplémentaires',   'heures',      'temps_travail', false, 20),
  (NULL, 'HEURES_NUIT',         'Heures de nuit',           'heures',      'temps_travail', false, 30),
  (NULL, 'HEURES_DIMANCHE',     'Heures du dimanche',       'heures',      'temps_travail', false, 40),
  (NULL, 'PRIME_PONCTUELLE',    'Prime ponctuelle',         'montant_chf', 'prime',         false, 50),
  (NULL, 'PRIME_OBJECTIFS',     'Prime sur objectifs',      'montant_chf', 'prime',         false, 60),
  (NULL, 'GRATIFICATION',       'Gratification',            'montant_chf', 'prime',         false, 70),
  (NULL, 'INDEMNITE_KM',        'Indemnité kilométrique',   'montant_chf', 'indemnite',     true,  80),
  (NULL, 'INDEMNITE_REPAS',     'Indemnité repas',          'montant_chf', 'indemnite',     true,  90),
  (NULL, 'INDEMNITE_TELEPHONE', 'Indemnité téléphone',      'montant_chf', 'indemnite',     true,  100),
  (NULL, 'AVANCE_SALAIRE',      'Avance sur salaire',       'montant_chf', 'retenue',       false, 110),
  (NULL, 'REMBOURSEMENT_FRAIS', 'Remboursement de frais',   'montant_chf', 'frais',         false, 120),
  (NULL, 'BONUS_13E_PARTIEL',   'Anticipation 13e salaire', 'montant_chf', 'prime',         false, 130);

-- ─── salaire.element_paie — 1 employé × 1 période × 1 type ───────────────────
CREATE TABLE salaire.element_paie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES salaire.employe(id) ON DELETE RESTRICT,
  type_element_id uuid NOT NULL REFERENCES salaire.type_element_paie(id) ON DELETE RESTRICT,
  valeur_numerique numeric(12, 4),
  valeur_texte text,
  commentaire text,
  source salaire.source_element NOT NULL,
  origine_element_id uuid REFERENCES salaire.element_paie(id) ON DELETE SET NULL,
  modifie_par_acteur_type salaire.acteur_modif,
  modifie_par_acteur_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_element_paie UNIQUE (periode_id, employe_id, type_element_id)
);
CREATE INDEX idx_element_paie_periode ON salaire.element_paie (cabinet_id, periode_id, employe_id);
CREATE INDEX idx_element_paie_type ON salaire.element_paie (periode_id, type_element_id);

-- ─── salaire.absence ────────────────────────────────────────────────────────
CREATE TABLE salaire.absence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES salaire.employe(id) ON DELETE RESTRICT,
  type salaire.type_absence NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  nb_jours_ouvres numeric(4, 1),
  nb_jours_calendaires integer,
  pourcentage_incapacite integer CHECK (pourcentage_incapacite IS NULL OR pourcentage_incapacite BETWEEN 0 AND 100),
  certificat_medical_recu boolean NOT NULL DEFAULT false,
  certificat_document_id uuid REFERENCES doc.document(id) ON DELETE SET NULL,
  assurance_concernee salaire.assurance_absence,
  montant_avance_employeur numeric(10, 2),
  source salaire.source_absence NOT NULL,
  commentaire text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_absence_dates CHECK (date_fin >= date_debut)
);
CREATE INDEX idx_absence_periode ON salaire.absence (cabinet_id, periode_id, employe_id);
CREATE INDEX idx_absence_employe ON salaire.absence (employe_id, date_debut);

-- ─── salaire.changement — déclarations significatives ───────────────────────
CREATE TABLE salaire.changement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL REFERENCES salaire.periode(id) ON DELETE CASCADE,
  employe_id uuid REFERENCES salaire.employe(id) ON DELETE SET NULL,
  type salaire.type_changement NOT NULL,
  date_effet date NOT NULL,
  description text,
  montant_impact numeric(10, 2),
  ancien_taux_activite numeric(5, 2),
  nouveau_taux_activite numeric(5, 2),
  ancien_salaire_base numeric(10, 2),
  nouveau_salaire_base numeric(10, 2),
  piece_justificative_id uuid REFERENCES doc.document(id) ON DELETE SET NULL,
  source salaire.source_changement NOT NULL,
  confiance_extraction numeric(3, 2),
  valide_par_fiduciaire boolean NOT NULL DEFAULT false,
  applique_dans_referentiel boolean NOT NULL DEFAULT false,
  confirme_dans_paie boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_changement_periode ON salaire.changement (cabinet_id, periode_id);
CREATE INDEX idx_changement_employe ON salaire.changement (employe_id);

-- ─── salaire.validation — 1 par période ─────────────────────────────────────
CREATE TABLE salaire.validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  periode_id uuid NOT NULL UNIQUE REFERENCES salaire.periode(id) ON DELETE CASCADE,
  valide_par_type salaire.valide_par_validation NOT NULL,
  valideur_contact_id uuid REFERENCES crm.contact(id) ON DELETE SET NULL,
  valideur_user_id uuid,
  methode salaire.methode_validation NOT NULL,
  date_validation timestamptz NOT NULL DEFAULT now(),
  message text,
  sans_changement_confirme boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_validation_periode ON salaire.validation (cabinet_id, periode_id);

-- ─── salaire.evenement — journal append-only ────────────────────────────────
CREATE TABLE salaire.evenement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  periode_id uuid REFERENCES salaire.periode(id) ON DELETE SET NULL,
  client_id uuid REFERENCES crm.client(id) ON DELETE SET NULL,
  type salaire.type_evenement NOT NULL,
  acteur_type salaire.acteur_evenement,
  acteur_id uuid,
  description text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_evenement_periode ON salaire.evenement (cabinet_id, periode_id, created_at);
CREATE INDEX idx_evenement_client ON salaire.evenement (cabinet_id, client_id, created_at);

-- ─── Triggers de cohérence cabinet/client (client_id NOT NULL ; evenement tolère NULL) ──
CREATE TRIGGER trg_check_client_cabinet_periode
  BEFORE INSERT OR UPDATE ON salaire.periode
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_element
  BEFORE INSERT OR UPDATE ON salaire.element_paie
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_absence
  BEFORE INSERT OR UPDATE ON salaire.absence
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_changement
  BEFORE INSERT OR UPDATE ON salaire.changement
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_validation
  BEFORE INSERT OR UPDATE ON salaire.validation
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_evenement
  BEFORE INSERT OR UPDATE ON salaire.evenement
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ─── RLS — tables scopées cabinet (4 policies) ──────────────────────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['periode','element_paie','absence','changement','validation','evenement']
  LOOP
    EXECUTE format('ALTER TABLE salaire.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON salaire.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON salaire.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON salaire.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON salaire.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- type_element_paie : catalogue (global lisible + override cabinet). RLS lecture globale.
ALTER TABLE salaire.type_element_paie ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalogue_select" ON salaire.type_element_paie FOR SELECT
  USING (cabinet_id IS NULL OR cabinet_id = current_cabinet_id());
CREATE POLICY "catalogue_insert" ON salaire.type_element_paie FOR INSERT
  WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "catalogue_update" ON salaire.type_element_paie FOR UPDATE
  USING (cabinet_id = current_cabinet_id());
CREATE POLICY "catalogue_delete" ON salaire.type_element_paie FOR DELETE
  USING (cabinet_id = current_cabinet_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA salaire TO authenticated;
