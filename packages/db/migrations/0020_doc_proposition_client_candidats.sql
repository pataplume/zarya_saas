-- Migration 0020 : Bloc B2 — rattachement client multi-signal (colonne client_candidats)
-- Réf : ADR 0014 (sémantique seuils confiance Doc) + docs/modules/doc.md §5.2/§5.3.
-- Forward-only, purement additif : une colonne jsonb nullable sur une table existante.
--
-- doc.proposition_classement.client_candidats stocke les candidats client classés
-- (top-3 homonymes, doc.md §5.3) produits par le resolver B2. Forme applicative :
--   { "confiance": 0.92, "palier": "auto"|"proposer"|"manuel",
--     "candidats": [ { "client_id": "<uuid>", "score": 0.92, "raison": "ide_exact" }, ... ] }
--
-- Distinct de confiance_par_champ (confiance PAR CHAMP de classification) : sémantique
-- différente, on ne surcharge pas cette colonne (cf. ADR 0014, alternative écartée).
-- Le client retenu (top candidat si palier auto/proposer) reste porté par client_id_propose.
--
-- Multi-tenant : aucune incidence RLS — la table porte déjà cabinet_id + ses 4 policies ;
-- le scope cabinet du rattachement est garanti côté applicatif par le resolver (jamais de
-- candidat cross-cabinet) et reste couvert par le test anti-fuite générique.

ALTER TABLE doc.proposition_classement
  ADD COLUMN IF NOT EXISTS client_candidats jsonb;
