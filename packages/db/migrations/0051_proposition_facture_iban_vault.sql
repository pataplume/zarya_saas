-- 0051 — IBAN-du-QR au Vault dès la proposition (ADR 0024 §5, Chantier 6 C6.1).
-- Le QR-bill suisse fournit un IBAN déterministe. On le capture CHIFFRÉ (Supabase Vault) dès la
-- proposition pour que le validateur le voie (masqué) et le confirme au lieu de le retaper, sans
-- jamais stocker d'IBAN en clair (ADR 0013). L'IBAN issu de l'IA reste stripé (non persisté).
ALTER TABLE facture.proposition_facture
  ADD COLUMN IF NOT EXISTS iban_paiement_vault_id uuid,
  ADD COLUMN IF NOT EXISTS iban_paiement_masque text;

COMMENT ON COLUMN facture.proposition_facture.iban_paiement_vault_id IS
  'IBAN de paiement issu du QR-bill, chiffré au Vault (ADR 0013). UUID du secret ; jamais de clair.';
COMMENT ON COLUMN facture.proposition_facture.iban_paiement_masque IS
  'IBAN masqué pour affichage seul (ex. CH.. .....012). Non sensible (pas l''IBAN complet).';
