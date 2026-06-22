-- 0052 — IA activée par défaut pour les nouveaux cabinets (ADR 0023 amendée, décision founder 2026-06-22).
--
-- Contexte : l'IA était opt-in par cabinet (DEFAULT false, migration 0043). En pratique, un
-- cabinet créé sans activation tombait en mode stub SILENCIEUX (classif sans LLM, OCR sauté) →
-- « le module ne reconnaît plus les factures » (incident Farah Clinic, 2026-06-22). Pour la bêta,
-- TOUS les cabinets ont besoin de l'IA → on passe en opt-out (DEFAULT true).
--
-- N'affecte QUE les futurs INSERT. Les cabinets existants conservent leur valeur actuelle
-- (désactivation/activation au cas par cas via /parametres/ia). Le kill-switch global reste
-- EXTRACTION_MODE=live (le flag n'a d'effet que si l'env est live).

ALTER TABLE crm.cabinet ALTER COLUMN extraction_ia_active SET DEFAULT true;

COMMENT ON COLUMN crm.cabinet.extraction_ia_active IS
  'Active la couche IA (classif / extraction facture / OCR vision / RAG) pour ce cabinet. '
  'N''a d''effet que si EXTRACTION_MODE=live (kill-switch global, ADR 0023). DEFAULT true depuis '
  'migration 0052 (bêta, opt-out) ; togglable via /parametres/ia.';
