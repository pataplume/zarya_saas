-- Migration 0030 : Bloc E1 — schéma facture.* (référentiel fournisseur + propositions +
-- factures + mapping export). Réf : docs/data-model/facture-schema.md §3-7, facture.md.
-- Forward-only, additif. Première ouverture du schéma facture.*.
--
-- Multi-tenant strict (ADR 0005) : cabinet_id NOT NULL + client_id (cohérence via trigger
-- crm.fn_check_client_cabinet). RLS 4 policies par table.
--
-- ⚠️ IBAN ULTRA-SENSIBLE (ADR 0013 + ADR 0020 décision founder) : 1er write-path facture.
-- Modèle ANTI-CLAIR (comme les tokens Microsoft D1) : aucune colonne IBAN en clair. L'IBAN
-- vit chiffré dans Supabase Vault ; seule la colonne *_vault_id (UUID du secret) est stockée.
-- La comparaison fraude (E4) déchiffrera la valeur côté app (cardinalité faible).
--
-- Périmètre E1 = STRUCTURE. Colonnes « stats/patterns appris » et table ligne_detail
-- (Phase 1.5) + facture.export (E6) DIFFÉRÉES (ajout additif ultérieur).

CREATE SCHEMA IF NOT EXISTS facture;

-- ════════════════════════════════════════════════════════════════════════════
-- Enums
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE facture.type_facture AS ENUM
  ('facture_standard', 'qr_facture', 'avoir', 'acompte', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE facture.devise AS ENUM ('CHF', 'EUR', 'USD', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE facture.statut_proposition AS ENUM
  ('a_valider', 'validee', 'rejetee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE facture.statut_facture AS ENUM
  ('en_attente_validation', 'validee', 'exportee', 'payee', 'annulee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. facture.fournisseur — référentiel par couple (cabinet, client)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facture.fournisseur (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id              uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id               uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  raison_sociale          text NOT NULL,
  nom_court               text,
  ide                     text,
  numero_tva              text,
  adresse                 jsonb,
  -- ANTI-CLAIR : UUID du secret Vault contenant l'IBAN principal (jamais en clair ici).
  iban_principal_vault_id uuid,
  bic                     text,
  categorie_habituelle    text,
  compte_charge_habituel  text,
  taux_tva_habituel       numeric(4,2),
  -- Historique des changements d'IBAN pour l'audit fraude (E4). Stocke des métadonnées
  -- (dates, vault_id avant/après), PAS d'IBAN en clair.
  iban_changements        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                   text,
  actif                   boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  archived_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fournisseur_lookup
  ON facture.fournisseur (cabinet_id, client_id, raison_sociale);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fournisseur_ide
  ON facture.fournisseur (cabinet_id, client_id, ide) WHERE ide IS NOT NULL;

COMMENT ON COLUMN facture.fournisseur.iban_principal_vault_id IS
  'ULTRA-SENSIBLE (indirection) — UUID du secret Supabase Vault contenant l''IBAN. Jamais '
  'd''IBAN en clair (ADR 0013 + ADR 0020). Déchiffrement service role serveur uniquement.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. facture.proposition_facture — extraction IA en attente de validation
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facture.proposition_facture (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id                uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                 uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  document_id               uuid NOT NULL UNIQUE REFERENCES doc.document(id) ON DELETE RESTRICT,
  extraction_invocation_id  uuid NOT NULL REFERENCES extraction.invocation(id) ON DELETE RESTRICT,
  statut                    facture.statut_proposition NOT NULL DEFAULT 'a_valider',
  fournisseur_existant_id   uuid REFERENCES facture.fournisseur(id) ON DELETE SET NULL,
  fournisseur_propose_data  jsonb,
  numero_facture_propose    text,
  type_propose              facture.type_facture NOT NULL DEFAULT 'facture_standard',
  date_emission_proposee    date,
  date_echeance_proposee    date,
  total_ht_propose          numeric(14,2),
  total_tva_propose         numeric(14,2),
  total_ttc_propose         numeric(14,2),
  montant_a_payer_propose   numeric(14,2),
  taux_tva_principal_propose numeric(4,2),
  devise_proposee           facture.devise NOT NULL DEFAULT 'CHF',
  categorie_proposee        text,
  qr_facture_detecte        boolean NOT NULL DEFAULT false,
  qr_facture_data           jsonb,
  confiance_globale         numeric(3,2),
  confiance_par_champ       jsonb,
  anomalies_detectees       text[],
  bbox_sources              jsonb,
  doublons_potentiels       uuid[],
  valide_par                uuid,
  date_validation           timestamptz,
  -- FK vers facture ajoutée après création de la table facture (cycle).
  facture_id                uuid,
  rejet_motif               text,
  corrections_apportees     jsonb,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposition_facture_statut
  ON facture.proposition_facture (cabinet_id, statut, created_at);
CREATE INDEX IF NOT EXISTS idx_proposition_facture_client
  ON facture.proposition_facture (cabinet_id, client_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. facture.facture — facture validée (source de vérité)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facture.facture (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id               uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id                uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  fournisseur_id           uuid NOT NULL REFERENCES facture.fournisseur(id) ON DELETE RESTRICT,
  document_id              uuid NOT NULL UNIQUE REFERENCES doc.document(id) ON DELETE RESTRICT,
  proposition_id           uuid UNIQUE REFERENCES facture.proposition_facture(id) ON DELETE SET NULL,
  numero_facture           text NOT NULL,
  type                     facture.type_facture NOT NULL DEFAULT 'facture_standard',
  date_emission            date NOT NULL,
  date_echeance            date,
  date_reception_zarya     timestamptz NOT NULL DEFAULT now(),
  reference_externe        text,
  total_ht                 numeric(14,2) NOT NULL,
  total_tva                numeric(14,2) NOT NULL DEFAULT 0,
  total_ttc                numeric(14,2) NOT NULL,
  montant_a_payer          numeric(14,2) NOT NULL,
  taux_tva_principal       numeric(4,2),
  devise                   facture.devise NOT NULL DEFAULT 'CHF',
  taux_change              numeric(10,6),
  -- ANTI-CLAIR : UUID du secret Vault contenant l'IBAN de paiement.
  iban_paiement_vault_id   uuid,
  reference_paiement       text,
  qr_facture               boolean NOT NULL DEFAULT false,
  categorie                text,
  compte_charge            text NOT NULL,
  statut                   facture.statut_facture NOT NULL DEFAULT 'en_attente_validation',
  statut_classement        text NOT NULL,
  iban_change_vs_historique boolean NOT NULL DEFAULT false,
  anomalies_signalees      text[],
  cree_par                 uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  archived_at              timestamptz,
  -- Cohérence des montants (tolérance arrondis ±0.05).
  CONSTRAINT chk_facture_montants CHECK (abs(total_ttc - (total_ht + total_tva)) <= 0.05)
);
CREATE INDEX IF NOT EXISTS idx_facture_client_date
  ON facture.facture (cabinet_id, client_id, date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_facture_fournisseur_date
  ON facture.facture (cabinet_id, fournisseur_id, date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_facture_statut ON facture.facture (cabinet_id, statut);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_facture_numero
  ON facture.facture (cabinet_id, fournisseur_id, numero_facture);

-- Cycle de FK : proposition_facture.facture_id → facture (créée maintenant).
ALTER TABLE facture.proposition_facture
  ADD CONSTRAINT fk_proposition_facture
  FOREIGN KEY (facture_id) REFERENCES facture.facture(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. facture.mapping_export — mapping vers logiciel comptable (cabinet ou client)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facture.mapping_export (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id               uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  -- NULL = mapping cabinet-global (pas de client spécifique).
  client_id                uuid REFERENCES crm.client(id) ON DELETE RESTRICT,
  logiciel_cible           text NOT NULL,
  version_logiciel         text,
  compte_fournisseur_defaut text NOT NULL,
  mappings_categories      jsonb NOT NULL DEFAULT '{}'::jsonb,
  mappings_tva             jsonb NOT NULL DEFAULT '{}'::jsonb,
  centre_cout_par_client   jsonb,
  encodage_fichier         text NOT NULL DEFAULT 'utf-8',
  separateur_csv           text NOT NULL DEFAULT ';',
  format_date              text NOT NULL DEFAULT 'YYYY-MM-DD',
  mode_export              text NOT NULL DEFAULT 'batch_hebdo',
  inclure_pdf_facture      boolean NOT NULL DEFAULT false,
  actif                    boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mapping_export_lookup
  ON facture.mapping_export (cabinet_id, client_id, logiciel_cible);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Triggers de cohérence cabinet/client (réutilise crm.fn_check_client_cabinet)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TRIGGER trg_check_client_cabinet_fournisseur
  BEFORE INSERT OR UPDATE ON facture.fournisseur
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_proposition
  BEFORE INSERT OR UPDATE ON facture.proposition_facture
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_facture
  BEFORE INSERT OR UPDATE ON facture.facture
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();
CREATE TRIGGER trg_check_client_cabinet_mapping
  BEFORE INSERT OR UPDATE ON facture.mapping_export
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS — 4 policies génériques par table (current_cabinet_id())
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['fournisseur','proposition_facture','facture','mapping_export']
  LOOP
    EXECUTE format('ALTER TABLE facture.%I ENABLE ROW LEVEL SECURITY', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_select" ON facture.%I FOR SELECT USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_insert" ON facture.%I FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_update" ON facture.%I FOR UPDATE USING (cabinet_id = current_cabinet_id())', r);
    EXECUTE format('CREATE POLICY "tenant_isolation_delete" ON facture.%I FOR DELETE USING (cabinet_id = current_cabinet_id())', r);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Grants (calqués sur 0003/0004)
-- ════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA facture TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA facture TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA facture
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
