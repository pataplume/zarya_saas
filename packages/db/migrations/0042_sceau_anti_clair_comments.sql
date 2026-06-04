-- 0042 — Phase I (sceau anti-clair). Étend les COMMENT ON COLUMN anti-oubli aux 2 colonnes
-- ultra-sensibles encore SANS write-path qui n'en avaient pas, conformément au § « Garde-fous
-- anti-oubli » de l'ADR 0013 (« COMMENT ON COLUMN ... à étendre rétroactivement à
-- param_comptable.acces_logiciel_externe et relation.iban_facturation lors de leur premier
-- write-path »). Anticipé ici (addendum Phase I) pour uniformiser le garde-fou. Purement
-- documentaire (aucun changement de schéma). Migration hand-written hors journal Drizzle,
-- appliquée manuellement à la base partagée (cf. convention 0023/0040/0041).

COMMENT ON COLUMN crm.param_comptable.acces_logiciel_externe IS
  'ULTRA-SENSIBLE — credentials logiciel comptable client. À chiffrer au repos via Supabase Vault (indirection *_vault_id) AVANT tout write-path (ADR 0013 + addendum Phase I). Aucune écriture en clair autorisée ; inscrire au registre SENSITIVE_COLUMNS.';

COMMENT ON COLUMN crm.relation.iban_facturation IS
  'ULTRA-SENSIBLE — IBAN de facturation. À chiffrer au repos via Supabase Vault (indirection *_vault_id) AVANT tout write-path (ADR 0013 + addendum Phase I). Aucune écriture en clair autorisée ; inscrire au registre SENSITIVE_COLUMNS.';
