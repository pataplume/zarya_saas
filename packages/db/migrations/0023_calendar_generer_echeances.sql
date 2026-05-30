-- Migration 0023 : Module Calendar — Run 6 (génération automatique des échéances)
-- Crée la fonction système calendar.fn_generer_echeances() qui matérialise les
-- crm.echeance récurrentes des clients à partir de leurs services actifs + régime
-- TVA, via le catalogue calendar.template_echeance (globaux + overrides cabinet),
-- puis sa planification pg_cron quotidienne. Forward-only, purement additif.
--
-- Cadre : ADR 0011 (périmètre Calendar), ADR 0012 (séquence — Bloc C), ADR 0016
-- (séquencement C/D). Aucune nouvelle table : on INSÈRE dans crm.echeance (Bloc A,
-- scellé) — donc pas de RLS/METIER_TABLES à étendre. La cohérence cabinet_id =
-- client.cabinet_id reste garantie par le trigger crm.fn_check_client_cabinet.
--
-- ── Décisions de cadrage (arbitrées founder, kickoff C1) ─────────────────────
--  1. MÉCANISME : fonction PL/pgSQL + pg_cron (schedule-natif, auto-contenu), pas
--     de cœur TS + route cron. Cf. ADR 0016 / KICKOFF C1 (surface nommée).
--  2. RÉGIME TVA : lu dans crm.service.parametres->>'regime_tva' (n'importe quel
--     service actif du client le portant). Remplace l'intention ADR 0011 §10
--     (« saisie dans crm.param_comptable ») : la table param_comptable scellée du
--     Bloc A n'a PAS de colonne regime_tva, et service.parametres est le point
--     d'extension libre déjà documenté du schéma (« ex. taux TVA »). Zéro reshape
--     du Bloc A. (Addendum ADR 0011 §10.)
--  3. IDEMPOTENCE : pas de doublon (client, template, date_echeance) non archivé —
--     via NOT EXISTS (le job quotidien est rejouable sans effet de bord).
--
-- ── Spécificités métier respectées (DoD C1) ─────────────────────────────────
--  - service_requis[]   : le client doit avoir ≥1 service ACTIF dont le type figure
--                         dans service_requis (NULL = applicable à tous).
--  - canton_specifique[]: NULL = fédéral (tous) ; sinon le canton fiscal du client
--                         doit y figurer. Le canton vit sur crm.adresse (Bloc A,
--                         scellé), PAS sur crm.client : on résout le canton fiscal
--                         = adresse de siège prioritaire, sinon adresse principale,
--                         sinon n'importe quelle adresse non archivée portant un
--                         canton. Remplace l'intention doc (calendar.md §14.1
--                         « crm.client.canton ») — colonne inexistante sur le schéma
--                         scellé. Zéro reshape du Bloc A. (Addendum ADR 0011 §9.)
--  - regime_tva[]       : NULL = tous régimes ; sinon match sur service.parametres.
--  - overrides cabinet  : un template propre au cabinet (herite_de_id = global)
--                         SUPPLANTE son parent global pour ce cabinet.
--
-- Fonction SYSTÈME : cross-cabinet par défaut (maintenance globale, comme le job de
-- transitions Run 3). Hors surface tenant : EXECUTE révoqué de PUBLIC. p_cabinet_id
-- permet un appel scopé (ex. à l'activation d'un service) ; p_today est injectable
-- pour des tests déterministes. Granularité au jour, current_date UTC (simplification
-- MVP assumée, cohérente Run 3).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Alignement du seed : service_requis 'salaire' → 'salaires'
-- Le seed des Runs 2/4 (migrations 0006/0008) a écrit service_requis = {'salaire'}
-- alors que crm.type_service vaut 'salaires' (pluriel). Le matching ci-dessous
-- compare service.type::text = ANY(service_requis) : on aligne donc le catalogue
-- global sur les valeurs réelles de l'enum (forward-only, n'affecte que les lignes
-- globales contenant le token erroné).
-- ════════════════════════════════════════════════════════════════════════════

UPDATE calendar.template_echeance
   SET service_requis = array_replace(service_requis, 'salaire', 'salaires'),
       updated_at = now()
 WHERE cabinet_id IS NULL
   AND 'salaire' = ANY(service_requis);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Fonction de génération
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calendar.fn_generer_echeances(
  p_cabinet_id   uuid    DEFAULT NULL,
  p_horizon_mois integer DEFAULT 12,
  p_today        date    DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count       integer;
  v_horizon_end date := (date_trunc('month', p_today::timestamp)
                          + ((p_horizon_mois) || ' months')::interval)::date;
BEGIN
  WITH
  -- Mois couverts par l'horizon de génération (1er de chaque mois).
  months AS (
    SELECT gs::date AS month_start
    FROM generate_series(
           date_trunc('month', p_today::timestamp),
           date_trunc('month', v_horizon_end::timestamp),
           interval '1 month'
         ) AS gs
  ),
  -- (client × template) applicables : services, canton, régime TVA, override.
  matched AS (
    SELECT
      c.id         AS client_id,
      c.cabinet_id AS cabinet_id,
      t.id         AS template_id,
      t.type_echeance,
      t.nom,
      t.frequence,
      t.jour_du_mois,
      t.mois_dans_annee,
      t.date_specifique,
      t.delai_alerte_jours,
      -- Service rattaché (déterministe) : le plus ancien service actif matchant.
      (SELECT s.id
         FROM crm.service s
        WHERE s.client_id = c.id AND s.actif AND s.archived_at IS NULL
          AND (t.service_requis IS NULL OR s.type::text = ANY(t.service_requis))
        ORDER BY s.id
        LIMIT 1) AS service_id
    FROM crm.client c
    JOIN calendar.template_echeance t
      ON (t.cabinet_id = c.cabinet_id OR t.cabinet_id IS NULL)
    WHERE c.archived_at IS NULL
      AND (p_cabinet_id IS NULL OR c.cabinet_id = p_cabinet_id)
      AND t.actif
      -- Un global supplanté par un override de CE cabinet est exclu.
      AND (t.cabinet_id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM calendar.template_echeance o
             WHERE o.cabinet_id = c.cabinet_id AND o.herite_de_id = t.id AND o.actif))
      -- service_requis : le client a un service actif du bon type.
      AND (t.service_requis IS NULL OR EXISTS (
            SELECT 1 FROM crm.service s
             WHERE s.client_id = c.id AND s.actif AND s.archived_at IS NULL
               AND s.type::text = ANY(t.service_requis)))
      -- canton_specifique : fédéral (NULL) ou canton fiscal du client listé.
      -- Le canton vit sur crm.adresse (siège prioritaire, sinon principale).
      AND (t.canton_specifique IS NULL OR (
            SELECT a.canton
              FROM crm.adresse a
             WHERE a.client_id = c.id AND a.archived_at IS NULL AND a.canton IS NOT NULL
             ORDER BY (a.type = 'siege') DESC, a.est_principale DESC, a.id
             LIMIT 1
          ) = ANY(t.canton_specifique))
      -- regime_tva : tous (NULL) ou régime porté par un service actif du client.
      AND (t.regime_tva IS NULL OR EXISTS (
            SELECT 1 FROM crm.service s2
             WHERE s2.client_id = c.id AND s2.actif AND s2.archived_at IS NULL
               AND s2.parametres ->> 'regime_tva' = ANY(t.regime_tva)))
  ),
  -- Occurrences datées : récurrentes (mensuelle/tri/semestrielle/annuelle) + ponctuelles.
  occurrences AS (
    SELECT
      m.client_id, m.cabinet_id, m.template_id, m.type_echeance, m.nom,
      m.delai_alerte_jours, m.service_id,
      make_date(
        EXTRACT(year  FROM mo.month_start)::int,
        EXTRACT(month FROM mo.month_start)::int,
        -- jour_du_mois borné au dernier jour du mois ; NULL → fin de mois.
        LEAST(
          COALESCE(
            m.jour_du_mois,
            EXTRACT(day FROM (mo.month_start + interval '1 month - 1 day'))::int
          ),
          EXTRACT(day FROM (mo.month_start + interval '1 month - 1 day'))::int
        )
      ) AS date_echeance
    FROM matched m
    JOIN months mo
      ON m.frequence IN ('mensuelle','trimestrielle','semestrielle','annuelle')
     AND (m.frequence = 'mensuelle'
          OR EXTRACT(month FROM mo.month_start)::int = ANY(m.mois_dans_annee))
    UNION ALL
    SELECT
      m.client_id, m.cabinet_id, m.template_id, m.type_echeance, m.nom,
      m.delai_alerte_jours, m.service_id, m.date_specifique
    FROM matched m
    WHERE m.frequence IN ('ponctuelle','evenement')
      AND m.date_specifique IS NOT NULL
  ),
  ins AS (
    INSERT INTO crm.echeance
      (cabinet_id, client_id, service_id, template_id, type, libelle,
       date_echeance, date_alerte, statut)
    SELECT DISTINCT
      o.cabinet_id, o.client_id, o.service_id, o.template_id, o.type_echeance,
      o.nom || ' (' || to_char(o.date_echeance, 'MM.YYYY') || ')',
      o.date_echeance,
      o.date_echeance - o.delai_alerte_jours,   -- date - integer = date (jours)
      'a_venir'::crm.statut_echeance
    FROM occurrences o
    WHERE o.date_echeance BETWEEN p_today AND v_horizon_end
      -- Idempotence : pas de doublon (client, template, date) non archivé.
      AND NOT EXISTS (
            SELECT 1 FROM crm.echeance e
             WHERE e.client_id     = o.client_id
               AND e.template_id   = o.template_id
               AND e.date_echeance = o.date_echeance
               AND e.archived_at IS NULL)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

-- Hors surface tenant : aucun rôle applicatif ne déclenche la génération système.
REVOKE ALL ON FUNCTION calendar.fn_generer_echeances(uuid, integer, date) FROM PUBLIC;

COMMENT ON FUNCTION calendar.fn_generer_echeances(uuid, integer, date) IS
  'Génération système (pg_cron quotidien) des crm.echeance récurrentes depuis les '
  'services actifs + régime TVA du client via calendar.template_echeance (globaux + '
  'overrides). Idempotente (client, template, date). Cross-cabinet par défaut ; '
  'p_cabinet_id pour un appel scopé. Hors surface tenant (REVOKE PUBLIC). Run 6.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Planification pg_cron (quotidienne, 02:00 UTC)
-- pg_cron est pré-sanctionné (packages/db/CLAUDE.md). Idempotent : on déprogramme
-- un éventuel job homonyme avant de (re)programmer. Le job rejoue tous cabinets,
-- horizon 12 mois — sans effet de bord grâce à l'idempotence de la fonction.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('calendar-generer-echeances');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- le job n'existait pas encore : rien à déprogrammer.
END;
$$;

SELECT cron.schedule(
  'calendar-generer-echeances',
  '0 2 * * *',
  $cron$SELECT calendar.fn_generer_echeances();$cron$
);
