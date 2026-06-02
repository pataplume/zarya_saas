-- ════════════════════════════════════════════════════════════════════════════
-- 0031 — Bloc F0 : schéma salaire MINIMAL consommé par l'onboarding-client.
--
-- Ouvre le schéma `salaire.*` avec les 2 tables FK-propres dont le Bloc F a besoin
-- immédiatement (arbitré founder) :
--   • salaire.employe       — référentiel employés (par client), Swissdec-ready
--   • salaire.acces_client  — comptes contacts RH client (mini-dashboard, F1)
-- Le cluster propositions (session_onboarding → upload_fichier → extraction_ia →
-- proposition_employe → proposition_champ) est DIFFÉRÉ à F6 (consommé là, FK complètes).
--
-- Multi-tenant : cabinet_id NOT NULL partout + client_id → trigger crm.fn_check_client_cabinet.
-- RLS 4 policies génériques. Grants authenticated.
--
-- ANTI-CLAIR (ADR 0013, précédent E1/E5a) : numero_avs et iban ultra-sensibles → stockés
-- comme UUID de secret Supabase Vault (numero_avs_vault_id / iban_vault_id), JAMAIS en clair.
-- (Réf salaire-schema.md §3 « chiffrement au repos » / §21 ; le write-path Vault = F6.)
-- Réf : docs/data-model/onboarding-client-schema.md, salaire-schema.md §3/§12 ; ADR 0007/0013.
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS salaire;

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE salaire.sexe AS ENUM ('m', 'f', 'autre');
CREATE TYPE salaire.etat_civil AS ENUM ('celibataire', 'marie', 'divorce', 'veuf', 'partenariat');
CREATE TYPE salaire.confession AS ENUM ('aucune', 'catholique_romaine', 'protestante', 'autre');
CREATE TYPE salaire.type_contrat AS ENUM ('cdi', 'cdd', 'apprentissage', 'stage', 'auxiliaire', 'independant');
CREATE TYPE salaire.statut_employe AS ENUM ('propose', 'actif', 'sorti', 'archive');
CREATE TYPE salaire.role_acces_client AS ENUM ('rh', 'dirigeant', 'admin');

-- ─── salaire.employe — référentiel hybride (ZARYA propose, logiciel de paie dispose) ──
CREATE TABLE salaire.employe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  numero_externe text,
  prenom text NOT NULL,
  nom text NOT NULL,
  date_naissance date,
  sexe salaire.sexe,
  -- ANTI-CLAIR : UUID du secret Vault (numéro AVS 756.XXXX.XXXX.XX), jamais en clair.
  numero_avs_vault_id uuid,
  nationalite text,
  permis_sejour text,
  canton_imposition text,
  commune_imposition text,
  etat_civil salaire.etat_civil,
  nb_enfants_charge integer,
  confession salaire.confession,
  adresse_rue text,
  adresse_npa text,
  adresse_ville text,
  adresse_pays text DEFAULT 'CH',
  -- ANTI-CLAIR : UUID du secret Vault (IBAN de versement salaire), jamais en clair.
  iban_vault_id uuid,
  email text,
  telephone text,
  fonction text,
  departement text,
  date_entree date,
  date_sortie date,
  motif_sortie text,
  taux_activite numeric(5, 2) CHECK (taux_activite IS NULL OR (taux_activite >= 0 AND taux_activite <= 100)),
  type_contrat salaire.type_contrat,
  salaire_base_mensuel numeric(10, 2),
  salaire_horaire numeric(8, 2),
  nombre_versements_annuels integer DEFAULT 12,
  statut salaire.statut_employe NOT NULL DEFAULT 'propose',
  confirme_dans_paie boolean NOT NULL DEFAULT false,
  date_confirmation_paie timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT chk_employe_sortie CHECK (date_sortie IS NULL OR date_entree IS NULL OR date_sortie >= date_entree)
);

CREATE INDEX idx_employe_client_statut ON salaire.employe (cabinet_id, client_id, statut);
CREATE UNIQUE INDEX uniq_employe_numero_externe
  ON salaire.employe (cabinet_id, client_id, numero_externe)
  WHERE numero_externe IS NOT NULL;

-- ─── salaire.acces_client — comptes contacts RH client (mini-dashboard) ──────
CREATE TABLE salaire.acces_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES crm.contact(id) ON DELETE RESTRICT,
  -- auth.users géré par Supabase : uuid simple sans FK (cf. convention crm.*).
  auth_user_id uuid UNIQUE,
  email text NOT NULL,
  role salaire.role_acces_client NOT NULL DEFAULT 'rh',
  actif boolean NOT NULL DEFAULT true,
  date_activation timestamptz,
  derniere_connexion timestamptz,
  nb_connexions integer NOT NULL DEFAULT 0,
  nb_validations_effectuees integer NOT NULL DEFAULT 0,
  token_activation text,
  token_activation_expire_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz
);

CREATE INDEX idx_acces_client_actif ON salaire.acces_client (cabinet_id, client_id, actif);
CREATE INDEX idx_acces_client_auth_user ON salaire.acces_client (auth_user_id);

-- ─── Triggers de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet) ──
CREATE TRIGGER trg_check_client_cabinet_employe
  BEFORE INSERT OR UPDATE ON salaire.employe
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_acces
  BEFORE INSERT OR UPDATE ON salaire.acces_client
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ─── RLS — 4 policies génériques par table (current_cabinet_id()) ─────────────
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['employe','acces_client']
  LOOP
    EXECUTE format('ALTER TABLE salaire.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON salaire.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON salaire.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON salaire.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON salaire.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- ─── Grants (calqués sur 0003/0004/0030) ─────────────────────────────────────
GRANT USAGE ON SCHEMA salaire TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA salaire TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA salaire
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
