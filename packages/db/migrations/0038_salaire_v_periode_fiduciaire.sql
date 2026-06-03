-- ════════════════════════════════════════════════════════════════════════════
-- 0038 — Bloc G4a : vue de pilotage fiduciaire du cycle salaire (lecture).
--
-- ADDITIF (aucune table touchée). 1 ligne par période avec le nom du client, l'avancement
-- et les compteurs — alimente le dashboard gestionnaire (KPIs + tableau par client + vue
-- annuelle). Porte cabinet_id pour le scope applicatif (RLS contournée par le service role).
-- Réf : docs/modules/salaire.md §6 ; data-model/salaire-schema.md §16 ; KICKOFF G4.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW salaire.v_periode_fiduciaire AS
SELECT
  p.id,
  p.cabinet_id,
  p.client_id,
  c.raison_sociale,
  p.annee,
  p.mois,
  p.statut,
  p.date_limite_validation,
  p.nb_employes_concernes,
  p.nb_changements_declares,
  p.pre_remplie,
  p.derniere_modification_par,
  p.derniere_modification_at,
  p.date_validation_recue,
  (v.id IS NOT NULL) AS validee,
  v.valide_par_type,
  (SELECT count(*) FROM salaire.piece pi WHERE pi.periode_id = p.id) AS nb_pieces,
  (SELECT count(*) FROM salaire.element_paie ep WHERE ep.periode_id = p.id) AS nb_elements
FROM salaire.periode p
JOIN crm.client c ON c.id = p.client_id
LEFT JOIN salaire.validation v ON v.periode_id = p.id;

GRANT SELECT ON salaire.v_periode_fiduciaire TO authenticated;
