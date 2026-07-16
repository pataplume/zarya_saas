-- ============================================================================
-- audit-residus-tests.sql — Inventaire LECTURE SEULE des résidus de tests
-- ============================================================================
-- Contexte (P0-2, AUDIT-MVP.md § 8) : jusqu'au 16.07.2026, les suites de tests
-- (locales et CI) tournaient contre la base de PRODUCTION via DATABASE_URL.
-- Résultat : ~929 lignes dans crm.cabinet, dont l'écrasante majorité sont des
-- cabinets fantômes créés par les tests d'intégration (seedTwoCabinets & co)
-- jamais nettoyés, plus des templates d'échéance et des users auth de test.
--
-- ⚠️ Ce script NE MODIFIE RIEN : uniquement des SELECT. C'est un outil
-- d'INVENTAIRE pour préparer un nettoyage MANUEL ultérieur.
-- Procédure complète : scripts/README.md (inventaire → validation founder →
-- purge manuelle).
--
-- Usage :
--   psql "$DATABASE_URL" -f scripts/audit-residus-tests.sql
--   (ou copier-coller requête par requête dans le SQL Editor Supabase)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vue d'ensemble : combien de cabinets, et combien sont suspects ?
--    Signal fort : un cabinet SANS AUCUN membre ne peut pas être un vrai
--    cabinet (l'onboarding crée toujours le responsable) — c'est la signature
--    des seeds de test dont le cleanup n'a pas tourné.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  count(*) AS cabinets_total,
  count(*) FILTER (WHERE m.cabinet_id IS NULL) AS cabinets_sans_membre,
  count(*) FILTER (WHERE c.raison_sociale LIKE 'Test %') AS cabinets_nommes_test,
  count(*) FILTER (WHERE c.raison_sociale LIKE '%isolation%') AS cabinets_isolation
FROM crm.cabinet c
LEFT JOIN (SELECT DISTINCT cabinet_id FROM crm.cabinet_membre) m ON m.cabinet_id = c.id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Liste détaillée des cabinets sans membre (candidats n°1 à la purge).
--    Exporter ce résultat (CSV) : c'est la liste à faire valider par le founder.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.id, c.raison_sociale, c.statut, c.created_at
FROM crm.cabinet c
LEFT JOIN (SELECT DISTINCT cabinet_id FROM crm.cabinet_membre) m ON m.cabinet_id = c.id
WHERE m.cabinet_id IS NULL
ORDER BY c.created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Cabinets au nom typique des seeds de test — recoupement avec la liste 2.
--    (seedTwoCabinets nomme « Test Cabinet A — isolation xxxxxxxx », etc.)
--    Un cabinet nommé « Test … » AVEC membre = probablement un user de test
--    créé via l'API admin GoTrue (emails ci-<uuid>@example.com, cf. requête 6).
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.id, c.raison_sociale, c.created_at,
  (m.cabinet_id IS NOT NULL) AS a_un_membre
FROM crm.cabinet c
LEFT JOIN (SELECT DISTINCT cabinet_id FROM crm.cabinet_membre) m ON m.cabinet_id = c.id
WHERE c.raison_sociale LIKE 'Test %'
   OR c.raison_sociale LIKE '%isolation%'
ORDER BY c.created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Templates d'échéance résiduels des tests (calendar.template_echeance).
--    Les suites du moteur d'échéances créent des overrides nommés
--    « Test … », « Override TVA … » et « TVA Lot2 … ».
-- ────────────────────────────────────────────────────────────────────────────
SELECT t.id, t.cabinet_id, t.nom, t.type_echeance, t.created_at
FROM calendar.template_echeance t
WHERE t.nom LIKE 'Test %'
   OR t.nom LIKE 'Override TVA %'
   OR t.nom LIKE 'TVA Lot2 %'
ORDER BY t.created_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Volumétrie des données rattachées aux cabinets sans membre : mesure le
--    rayon d'impact d'une purge (les DELETE devront suivre l'ordre des FK).
-- ────────────────────────────────────────────────────────────────────────────
WITH orphelins AS (
  SELECT c.id
  FROM crm.cabinet c
  LEFT JOIN (SELECT DISTINCT cabinet_id FROM crm.cabinet_membre) m ON m.cabinet_id = c.id
  WHERE m.cabinet_id IS NULL
)
SELECT
  (SELECT count(*) FROM orphelins) AS cabinets_orphelins,
  (SELECT count(*) FROM crm.client cl WHERE cl.cabinet_id IN (SELECT id FROM orphelins)) AS clients_rattaches,
  (SELECT count(*) FROM crm.echeance e WHERE e.cabinet_id IN (SELECT id FROM orphelins)) AS echeances_rattachees,
  (SELECT count(*) FROM calendar.template_echeance t WHERE t.cabinet_id IN (SELECT id FROM orphelins)) AS templates_rattaches,
  (SELECT count(*) FROM crm.session_onboarding_fiduciaire s WHERE s.cabinet_id IN (SELECT id FROM orphelins)) AS sessions_onboarding;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Users auth créés par les tests (API admin GoTrue) — emails générés par
--    tests/integration/helpers/auth.ts au format ci-<uuid>@example.com.
-- ────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS users_auth_de_test
FROM auth.users u
WHERE u.email LIKE 'ci-%@example.com';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Volumes vivants par table métier (estimation planner, aucune lecture des
--    lignes) : donne l'ordre de grandeur de la pollution par schéma/table.
-- ────────────────────────────────────────────────────────────────────────────
SELECT schemaname AS schema, relname AS "table", n_live_tup AS lignes_estimees
FROM pg_stat_user_tables
WHERE schemaname IN ('crm', 'doc', 'facture', 'salaire', 'calendar', 'extraction', 'audit', 'search')
ORDER BY schemaname, n_live_tup DESC;
