-- Bloc E — saisie manuelle de facture (RUN4 usabilité, arbitrage founder "double validation").
-- La proposition manuelle passe par la MÊME file que l'extraction IA, mais sans invocation IA :
-- extraction_invocation_id devient nullable (mirroir exact du pattern déjà utilisé sur
-- doc.proposition_classement.extraction_invocation_id). document_id RESTE NOT NULL : un
-- justificatif (document déjà uploadé/classé) reste obligatoire, cohérence avec l'invariant
-- "toute facture a une pièce" documenté (facture-schema.md §5) — facture.facture.document_id
-- n'est PAS touché par cette migration.
CREATE TYPE facture.origine_saisie AS ENUM ('extraction_ia', 'saisie_manuelle');

ALTER TABLE facture.proposition_facture
  ALTER COLUMN extraction_invocation_id DROP NOT NULL;

ALTER TABLE facture.proposition_facture
  ADD COLUMN origine_saisie facture.origine_saisie NOT NULL DEFAULT 'extraction_ia';
