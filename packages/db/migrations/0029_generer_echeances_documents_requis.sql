-- Migration 0029 : C1+ — peupler crm.echeance.documents_requis à la génération.
-- Réf : ADR 0011, echeance-schema §9, KICKOFF §C1/§C4. Forward-only (CREATE OR REPLACE).
--
-- POURQUOI : C4 (couverture « doc reçu → échéance traitee ») ne se déclenche que si
-- l'échéance liste ses pièces attendues dans documents_requis. Or fn_generer_echeances
-- (0023) ne le remplissait PAS → les échéances générées avaient documents_requis vide →
-- la couverture ne matchait jamais. On ajoute la résolution : documents_requis = ids des
-- crm.document_attendu du client dont type_document ∈ template.documents_requis_types
-- (clé documentée — le template déclare déjà les types de pièces requis).
--
-- ⚠️ Dépend de l'ALIGNEMENT DE VOCABULAIRE entre document_attendu.type_document (texte) et
-- template_echeance.documents_requis_types (slugs). Si non aligné, documents_requis reste
-- vide (aucune couverture erronée — comportement sûr). N'affecte que les générations
-- FUTURES (les échéances existantes gardent documents_requis = NULL ; backfill séparé si
-- besoin). Aucune autre modification de la logique 0023.

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
  months AS (
    SELECT gs::date AS month_start
    FROM generate_series(
           date_trunc('month', p_today::timestamp),
           date_trunc('month', v_horizon_end::timestamp),
           interval '1 month'
         ) AS gs
  ),
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
      AND (t.cabinet_id IS NOT NULL OR NOT EXISTS (
            SELECT 1 FROM calendar.template_echeance o
             WHERE o.cabinet_id = c.cabinet_id AND o.herite_de_id = t.id AND o.actif))
      AND (t.service_requis IS NULL OR EXISTS (
            SELECT 1 FROM crm.service s
             WHERE s.client_id = c.id AND s.actif AND s.archived_at IS NULL
               AND s.type::text = ANY(t.service_requis)))
      AND (t.canton_specifique IS NULL OR (
            SELECT a.canton
              FROM crm.adresse a
             WHERE a.client_id = c.id AND a.archived_at IS NULL AND a.canton IS NOT NULL
             ORDER BY (a.type = 'siege') DESC, a.est_principale DESC, a.id
             LIMIT 1
          ) = ANY(t.canton_specifique))
      AND (t.regime_tva IS NULL OR EXISTS (
            SELECT 1 FROM crm.service s2
             WHERE s2.client_id = c.id AND s2.actif AND s2.archived_at IS NULL
               AND s2.parametres ->> 'regime_tva' = ANY(t.regime_tva)))
  ),
  occurrences AS (
    SELECT
      m.client_id, m.cabinet_id, m.template_id, m.type_echeance, m.nom,
      m.delai_alerte_jours, m.service_id,
      make_date(
        EXTRACT(year  FROM mo.month_start)::int,
        EXTRACT(month FROM mo.month_start)::int,
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
       date_echeance, date_alerte, statut, documents_requis)
    SELECT DISTINCT
      o.cabinet_id, o.client_id, o.service_id, o.template_id, o.type_echeance,
      o.nom || ' (' || to_char(o.date_echeance, 'MM.YYYY') || ')',
      o.date_echeance,
      o.date_echeance - o.delai_alerte_jours,
      'a_venir'::crm.statut_echeance,
      -- C1+ : pièces attendues = document_attendu du client dont le type figure dans
      -- les documents_requis_types du template (NULL si aucun / non aligné).
      (SELECT array_agg(da.id)
         FROM crm.document_attendu da
         JOIN calendar.template_echeance tt ON tt.id = o.template_id
        WHERE da.client_id  = o.client_id
          AND da.cabinet_id = o.cabinet_id
          AND da.archived_at IS NULL
          AND tt.documents_requis_types IS NOT NULL
          AND da.type_document = ANY(tt.documents_requis_types))
    FROM occurrences o
    WHERE o.date_echeance BETWEEN p_today AND v_horizon_end
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
