-- Migration 0018 : Clôture fondation CRM — Bloc A10 (vues + trigger derniere_activite)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §21 (vues) et §23.3 (trigger).
-- Forward-only, purement additif : 3 vues de lecture + 1 fonction/trigger mécanique.
-- Aucun changement de structure sur les tables existantes.
--
-- PÉRIMÈTRE A10 (clôture DB de la fondation) :
--   • §21 — trois vues dénormalisées (security_invoker = true → honorent la RLS du
--     rôle appelant ; sur le chemin app service-role la RLS est contournée, donc le
--     filtre cabinet_id discipliné dans le WHERE reste la frontière de sécurité réelle,
--     cf. ADR 0005 addendum). Les vues exposent `cabinet_id` pour permettre ce filtre.
--   • §23.3 — trigger après INSERT sur crm.evenement → met à jour
--     crm.risque.derniere_activite (pur mécanisme, pas de logique métier).
--
-- HORS PÉRIMÈTRE (décidé, non oublié) :
--   • §23.2 recalc_risque(client_id) : AUCUNE formule de scoring spécifiée dans la doc.
--     Inventer un barème dans une fondation « jamais reshapée » serait une dette → DIFFÉRÉ
--     à une décision métier/ADR dédiée. Le trigger d'appel n'est donc PAS créé ici.
--   • §23.4 génération échéances récurrentes (pg_cron) : job, pas schéma → module Calendar.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. crm.v_client_dashboard — Listing dénormalisé (§21)
-- ════════════════════════════════════════════════════════════════════════════
-- Un client + son risque (LEFT JOIN, le risque peut ne pas exister) + sa prochaine
-- échéance ouverte + son nombre de documents manquants. Clients archivés exclus.

CREATE OR REPLACE VIEW crm.v_client_dashboard
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.cabinet_id,
  c.raison_sociale,
  c.type,
  c.statut,
  c.langue,
  r.score   AS risque_score,
  r.niveau  AS risque_niveau,
  (SELECT MIN(e.date_echeance) FROM crm.echeance e
    WHERE e.client_id = c.id
      AND e.statut IN ('a_venir', 'imminente')
      AND e.archived_at IS NULL) AS prochaine_echeance,
  (SELECT COUNT(*) FROM crm.document_attendu d
    WHERE d.client_id = c.id
      AND d.statut_periode_courante IN ('manquant', 'en_retard')
      AND d.archived_at IS NULL) AS nb_documents_manquants,
  r.derniere_activite
FROM crm.client c
LEFT JOIN crm.risque r ON r.client_id = c.id
WHERE c.archived_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.v_echeances_a_venir — Échéances des 30 prochains jours, par cabinet (§21)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW crm.v_echeances_a_venir
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.cabinet_id,
  e.client_id,
  c.raison_sociale,
  e.type,
  e.libelle,
  e.date_echeance,
  e.date_alerte,
  e.statut
FROM crm.echeance e
JOIN crm.client c ON c.id = e.client_id
WHERE e.archived_at IS NULL
  AND c.archived_at IS NULL
  AND e.statut IN ('a_venir', 'imminente')
  AND e.date_echeance <= current_date + interval '30 days';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.v_documents_manquants — Documents en retard ou manquants, par cabinet (§21)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW crm.v_documents_manquants
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.cabinet_id,
  d.client_id,
  c.raison_sociale,
  d.type_document,
  d.categorie,
  d.frequence,
  d.statut_periode_courante,
  d.derniere_periode_recue
FROM crm.document_attendu d
JOIN crm.client c ON c.id = d.client_id
WHERE d.archived_at IS NULL
  AND c.archived_at IS NULL
  AND d.actif = true
  AND d.statut_periode_courante IN ('manquant', 'en_retard');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger derniere_activite (§23.3)
-- ════════════════════════════════════════════════════════════════════════════
-- Après INSERT d'un événement rattaché à un client, propage l'horodatage sur la
-- ligne de risque du client. Idempotent (CREATE OR REPLACE). Court-circuite si
-- l'événement est cabinet-level (client_id NULL) ou si la ligne risque n'existe
-- pas encore (UPDATE sur 0 ligne, sans erreur).

CREATE OR REPLACE FUNCTION crm.fn_touch_derniere_activite()
RETURNS trigger AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    UPDATE crm.risque
      SET derniere_activite = NEW.created_at,
          updated_at = now()
      WHERE client_id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_derniere_activite ON crm.evenement;
CREATE TRIGGER trg_touch_derniere_activite
  AFTER INSERT ON crm.evenement
  FOR EACH ROW EXECUTE FUNCTION crm.fn_touch_derniere_activite();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Lecture des vues (les vues héritent de la RLS des tables sous-jacentes via
--    security_invoker ; on accorde juste le SELECT au rôle authentifié + service).
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON crm.v_client_dashboard    TO authenticated;
GRANT SELECT ON crm.v_echeances_a_venir   TO authenticated;
GRANT SELECT ON crm.v_documents_manquants TO authenticated;
