-- ════════════════════════════════════════════════════════════════════════════
-- 0034 — Bloc F7 : vues de progression & relance de l'onboarding client.
--
-- ADDITIF (aucune table touchée) : 2 vues de lecture sur salaire.session_onboarding.
--   • salaire.v_session_onboarding_progress — avancement % (étapes + employés) par session
--   • salaire.v_extractions_a_relancer        — sessions inactives ≥ 7 j (notification fiduciaire)
--
-- Les vues portent `cabinet_id` pour permettre le scope applicatif (le `db` service role
-- contourne la RLS — filtre cabinet_id discipliné côté app, cf. addendum ADR 0005).
-- Réf : docs/data-model/onboarding-client-schema.md §11 ; onboarding-client.md §10/§12.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW salaire.v_session_onboarding_progress AS
SELECT
  s.id,
  s.cabinet_id,
  s.client_id,
  c.raison_sociale,
  s.statut,
  CASE
    WHEN s.etape_3b_terminee_at IS NOT NULL THEN 100
    WHEN s.etape_3a_terminee_at IS NOT NULL THEN 80
    WHEN s.etape_2_terminee_at IS NOT NULL THEN 60
    WHEN s.etape_1_terminee_at IS NOT NULL THEN 40
    ELSE 20
  END AS progression_pct,
  s.nb_employes_attendus,
  s.nb_employes_proposes,
  s.nb_employes_valides,
  CASE
    WHEN COALESCE(s.nb_employes_attendus, 0) > 0
      THEN LEAST(100, (s.nb_employes_valides::float / s.nb_employes_attendus * 100)::int)
    ELSE 0
  END AS employes_progression_pct,
  s.date_demarrage,
  s.date_derniere_activite,
  s.dernier_acteur_type,
  s.dernier_acteur_id
FROM salaire.session_onboarding s
JOIN crm.client c ON c.id = s.client_id;

CREATE OR REPLACE VIEW salaire.v_extractions_a_relancer AS
SELECT
  s.id,
  s.cabinet_id,
  s.client_id,
  c.raison_sociale,
  s.statut,
  s.date_derniere_activite,
  (EXTRACT(EPOCH FROM (now() - s.date_derniere_activite)) / 86400)::int AS jours_inactivite
FROM salaire.session_onboarding s
JOIN crm.client c ON c.id = s.client_id
WHERE s.statut IN ('initialisee', 'etape_1_en_cours', 'etape_2_en_cours', 'etape_3_en_cours')
  AND s.date_derniere_activite < now() - interval '7 days';

GRANT SELECT ON salaire.v_session_onboarding_progress TO authenticated;
GRANT SELECT ON salaire.v_extractions_a_relancer TO authenticated;
