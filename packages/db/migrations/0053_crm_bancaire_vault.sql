-- ════════════════════════════════════════════════════════════════════════════
-- 0053 — Bascule Vault Phase I des colonnes bancaires / facturation / accès externe
--        du client (ADR 0013 + ADR 0025 §6, Lot 5). 1er write-path vers ces champs.
--
-- CONTEXTE : le Bloc A (crm.*, SCELLÉ) portait dès l'origine quatre colonnes ULTRA-
-- SENSIBLES SANS write-path (mécanisme "clair_differe" au registre anti-clair) :
--   • crm.banque.iban                       (NOT NULL, IBAN client)
--   • crm.banque.credentials_open_banking   (secrets Open Banking)
--   • crm.relation.iban_facturation         (IBAN de facturation)
--   • crm.param_comptable.acces_logiciel_externe (credentials logiciel comptable)
-- Le Lot 5 ouvre leur premier write-path → bascule OBLIGATOIRE en Vault (ADR 0013) :
-- la donnée vit chiffrée dans Supabase Vault, la table ne stocke QUE l'UUID du secret
-- (*_vault_id) + un masque d'affichage non sensible (*_masque, 4 derniers car. de l'IBAN).
--
-- Ce N'EST PAS un reshape du contrat métier de Bloc A : aucune table/relation n'est
-- redéfinie ; on remplace une colonne JAMAIS écrite en clair par son indirection Vault.
-- C'est précisément la condition de révision prévue par l'ADR 0013 (« 1er write-path »).
--
-- Forward-only. Aucune donnée en clair n'existe (colonnes jamais peuplées) → DROP sûr.
-- Réf : tests/integration/anti-plaintext/sensitive-columns.ts (passage clair_differe → vault).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── crm.banque : iban (NOT NULL en clair) + credentials_open_banking → Vault ──────────────
ALTER TABLE crm.banque
  ADD COLUMN IF NOT EXISTS iban_vault_id uuid,
  ADD COLUMN IF NOT EXISTS iban_masque text,
  ADD COLUMN IF NOT EXISTS credentials_open_banking_vault_id uuid;

-- L'IBAN en clair n'a jamais eu de write-path : on le retire (la donnée vit au Vault).
ALTER TABLE crm.banque DROP COLUMN IF EXISTS iban;
ALTER TABLE crm.banque DROP COLUMN IF EXISTS credentials_open_banking;

COMMENT ON COLUMN crm.banque.iban_vault_id IS
  'IBAN du compte client, chiffré au Vault (ADR 0013). UUID du secret ; jamais de clair.';
COMMENT ON COLUMN crm.banque.iban_masque IS
  'IBAN masqué pour affichage seul (ex. ****0012). Non sensible (pas l''IBAN complet).';
COMMENT ON COLUMN crm.banque.credentials_open_banking_vault_id IS
  'Secrets Open Banking, chiffrés au Vault (ADR 0013). UUID du secret ; jamais de clair.';

-- ─── crm.relation : iban_facturation → Vault ───────────────────────────────────────────────
ALTER TABLE crm.relation
  ADD COLUMN IF NOT EXISTS iban_facturation_vault_id uuid,
  ADD COLUMN IF NOT EXISTS iban_facturation_masque text;

ALTER TABLE crm.relation DROP COLUMN IF EXISTS iban_facturation;

COMMENT ON COLUMN crm.relation.iban_facturation_vault_id IS
  'IBAN de facturation, chiffré au Vault (ADR 0013). UUID du secret ; jamais de clair.';
COMMENT ON COLUMN crm.relation.iban_facturation_masque IS
  'IBAN de facturation masqué pour affichage seul (ex. ****0012). Non sensible.';

-- ─── crm.param_comptable : acces_logiciel_externe → Vault ──────────────────────────────────
ALTER TABLE crm.param_comptable
  ADD COLUMN IF NOT EXISTS acces_logiciel_externe_vault_id uuid;

ALTER TABLE crm.param_comptable DROP COLUMN IF EXISTS acces_logiciel_externe;

COMMENT ON COLUMN crm.param_comptable.acces_logiciel_externe_vault_id IS
  'Credentials du logiciel comptable externe, chiffrés au Vault (ADR 0013). UUID du secret ; jamais de clair.';
