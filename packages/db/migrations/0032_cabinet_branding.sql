-- ════════════════════════════════════════════════════════════════════════════
-- 0032 — Bloc F2 : branding cabinet pour le dashboard client (header aux couleurs cabinet).
--
-- Colonnes ADDITIVES sur crm.cabinet (Bloc A scellé — additif autorisé, cf. ADR 0019) :
-- logo + couleurs, appliquées en CSS variables dans la coquille du mini-dashboard client
-- (dashboard-client.md §4.1). Toutes NULLABLE → défauts ZARYA si non renseignées.
-- Le branding sera collecté par l'onboarding-fiduciaire (livrable séparé). Pas de RLS à
-- ajouter (crm.cabinet = racine tenant, déjà gérée).
-- Réf : docs/modules/dashboard-client.md §4.1 ; KICKOFF Bloc F / F2.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.cabinet ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE crm.cabinet ADD COLUMN IF NOT EXISTS couleur_primaire text;
ALTER TABLE crm.cabinet ADD COLUMN IF NOT EXISTS couleur_secondaire text;
