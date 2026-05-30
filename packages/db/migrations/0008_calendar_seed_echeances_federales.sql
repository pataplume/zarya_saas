-- Migration 0008 : Module Calendar — Run 4 (seed des échéances fédérales)
-- Ajoute au catalogue global ZARYA (calendar.template_echeance, cabinet_id NULL) les
-- échéances réglementaires FÉDÉRALES récurrentes que le seed du Run 2 (migration 0006)
-- ne couvrait pas encore. Forward-only, purement additif.
--
-- Cadre (ADR 0011, addendum 2026-05-30) : les échéances fédérales/cantonales sont des
-- LIGNES GLOBALES de calendar.template_echeance (pas une nouvelle table), lisibles par
-- tous les tenants via la policy RLS de catalogue global. Les colonnes
-- canton_specifique[] / date_specifique portent la spécificité cantonale/ponctuelle ;
-- ces lignes-ci sont purement fédérales (canton_specifique NULL).
--
-- Périmètre CONSERVATEUR : on ne seed QUE les échéances explicitement énumérées dans
-- docs/modules/calendar.md §2.1 et non déjà présentes au Run 2 :
--   - Certificat de salaire annuel             (§2.1 « Salaires » / « Fiscales »)
--   - Décompte annuel AVS/AC                    (§2.1 « Salaires »)
--   - Décompte annuel LPP                       (§2.1 « Salaires » / « Sociales »)
--   - Décompte annuel impôt à la source (IS)    (§2.1 « Salaires »)
--   - Cotisations AVS trimestrielles            (§2.1 « Sociales »)
--
-- PROVENANCE & RÉSERVE : les jours-du-mois et délais d'alerte ci-dessous sont une
-- BASELINE PRUDENTE (mois corrects, jour conservateur), à VALIDER avec le founder / un
-- expert fiduciaire avant mise en production réelle (condition de révision ADR 0011).
-- Un cabinet peut surcharger n'importe quel template global par une ligne propre.
--
-- Unicité : uniq_template_echeance_global_nom (nom) WHERE cabinet_id IS NULL — les noms
-- ci-dessous sont distincts de ceux du Run 2.

INSERT INTO calendar.template_echeance
  (cabinet_id, nom, type_echeance, frequence, service_requis, regime_tva,
   jour_du_mois, mois_dans_annee, delai_alerte_jours, documents_requis_types, description)
VALUES
  -- Certificats de salaire à remettre aux employés / au fisc en début d'année N+1.
  (NULL, 'Certificat de salaire annuel', 'salaire', 'annuelle',
   ARRAY['salaire'], NULL, 31, ARRAY[1], 30, NULL,
   'Établissement des certificats de salaire annuels (année précédente). '
   'Échéance baseline fin janvier — à valider (expert fiduciaire).'),

  -- Décompte annuel AVS/AC auprès de la caisse de compensation (cotisations groupées).
  (NULL, 'Décompte annuel AVS/AC', 'salaire', 'annuelle',
   ARRAY['salaire'], NULL, 30, ARRAY[1], 30, NULL,
   'Décompte annuel des cotisations AVS / AC (assurance chômage) — caisse de '
   'compensation. Échéance baseline janvier — à valider.'),

  -- Décompte annuel LPP (prévoyance professionnelle).
  (NULL, 'Décompte annuel LPP', 'salaire', 'annuelle',
   ARRAY['salaire'], NULL, 31, ARRAY[1], 30, NULL,
   'Décompte annuel LPP (prévoyance professionnelle). '
   'Échéance baseline janvier — à valider.'),

  -- Décompte annuel impôt à la source (IS).
  (NULL, 'Décompte annuel impôt à la source (IS)', 'salaire', 'annuelle',
   ARRAY['salaire'], NULL, 31, ARRAY[1], 30, NULL,
   'Décompte annuel de l''impôt à la source retenu sur les salaires. '
   'Échéance baseline janvier — à valider (modalités cantonales possibles).'),

  -- Cotisations AVS acomptes trimestriels (mois suivant la fin de chaque trimestre).
  (NULL, 'Cotisations AVS trimestrielles', 'salaire', 'trimestrielle',
   ARRAY['salaire'], NULL, 10, ARRAY[1,4,7,10], 14, NULL,
   'Acomptes trimestriels des cotisations AVS. Échéance baseline le 10 du mois '
   'suivant chaque trimestre — à valider.');
