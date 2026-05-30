-- Migration 0007 : Module Calendar — Run 3 (moteur de transitions de statut)
-- Crée la fonction système calendar.fn_transition_statuts_echeances() qui fait
-- progresser le statut des crm.echeance selon les dates, + sa planification pg_cron
-- horaire (ADR 0011 décision #1 : « job horaire léger pour les seules transitions
-- de statut »). Forward-only, purement additif.
--
-- Périmètre Run 3 (ADR 0011) : transitions de statut UNIQUEMENT. La génération
-- automatique d'échéances (déclenchée par les services/régime TVA du client,
-- calendar.md §3.1) est DIFFÉRÉE : elle dépend d'attributs absents de crm.client
-- (extension CRM hors périmètre Phase 4.0).
--
-- Cycle couvert (calendar.md §4) :
--   a_venir  --(date_alerte atteinte, échéance non dépassée)-->  imminente
--   a_venir | imminente  --(date_echeance dépassée)-->  en_retard
-- Les états terminaux/manuels (traitee, reportee, annulee) ne sont jamais touchés.
--
-- Fonction SYSTÈME : opère cross-cabinet (maintenance globale, comme le futur job
-- de génération). Volontairement HORS surface tenant : EXECUTE révoqué de PUBLIC,
-- donc le rôle authenticated ne peut pas l'appeler. Seuls le propriétaire (postgres,
-- via pg_cron) et le service role l'exécutent.
--
-- Granularité au jour (ADR 0011 §1) : current_date en UTC sur Supabase. L'écart de
-- fuseau (Europe/Zurich) à minuit est une simplification MVP assumée.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Fonction de transition de statut
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calendar.fn_transition_statuts_echeances()
RETURNS TABLE (passees_imminente integer, passees_en_retard integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_imminente integer;
  v_retard    integer;
BEGIN
  -- a_venir → imminente : la date d'alerte est atteinte, l'échéance n'est pas dépassée.
  WITH upd AS (
    UPDATE crm.echeance
       SET statut = 'imminente', updated_at = now()
     WHERE statut = 'a_venir'
       AND date_alerte IS NOT NULL
       AND date_alerte <= current_date
       AND date_echeance >= current_date
       AND archived_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_imminente FROM upd;

  -- (a_venir | imminente) → en_retard : la date d'échéance est dépassée sans traitement.
  -- (Une échéance sans date_alerte saute directement de a_venir à en_retard.)
  WITH upd AS (
    UPDATE crm.echeance
       SET statut = 'en_retard', updated_at = now()
     WHERE statut IN ('a_venir', 'imminente')
       AND date_echeance < current_date
       AND archived_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_retard FROM upd;

  RETURN QUERY SELECT v_imminente, v_retard;
END;
$$;

-- Hors surface tenant : aucun rôle applicatif ne doit déclencher la maintenance.
REVOKE ALL ON FUNCTION calendar.fn_transition_statuts_echeances() FROM PUBLIC;

COMMENT ON FUNCTION calendar.fn_transition_statuts_echeances() IS
  'Maintenance système (pg_cron horaire) : fait progresser crm.echeance.statut '
  'selon les dates (a_venir→imminente→en_retard). Cross-cabinet, hors surface tenant.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Planification pg_cron (horaire, minute 0) — ADR 0011 §1
-- pg_cron est pré-sanctionné (packages/db/CLAUDE.md, liste des extensions).
-- Idempotent : on déprogramme un éventuel job homonyme avant de (re)programmer.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('calendar-transition-statuts');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- le job n'existait pas encore : rien à déprogrammer.
END;
$$;

SELECT cron.schedule(
  'calendar-transition-statuts',
  '0 * * * *',
  $cron$SELECT calendar.fn_transition_statuts_echeances();$cron$
);
