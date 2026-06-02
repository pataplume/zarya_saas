-- Migration 0028 : Bloc C2b — tracking des relances envoyées.
-- Réf : ADR 0019 (exception au sceau du Bloc A — décision founder explicite). Additif
-- STRICT : deux colonnes nullables sur crm.relance, aucune colonne/contrainte existante
-- touchée. Sert au tracking des réponses (C4 : rapprochement In-Reply-To).
--
-- ⚠️ EXCEPTION DOCUMENTÉE au sceau du Bloc A (ADR 0012 « jamais reshapé »). Bornée :
-- additive uniquement, sur crm.relance, au service d'un besoin produit réel (ADR 0019).

ALTER TABLE crm.relance
  ADD COLUMN IF NOT EXISTS microsoft_message_id text,
  ADD COLUMN IF NOT EXISTS internet_message_id text;

COMMENT ON COLUMN crm.relance.microsoft_message_id IS
  'Id du message Microsoft Graph de la relance envoyée (obtenu via draft+send, ADR 0019). '
  'Sert aux opérations Graph ultérieures.';
COMMENT ON COLUMN crm.relance.internet_message_id IS
  'internetMessageId du message envoyé — clé de rapprochement In-Reply-To pour détecter '
  'les réponses clients (C4).';
