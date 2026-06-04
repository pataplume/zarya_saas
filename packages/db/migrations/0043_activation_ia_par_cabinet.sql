-- 0043 — IA-a : activation de l'IA par cabinet + suivi des coûts (ADR 0023).
-- Colonne ADDITIVE sur crm.cabinet (Bloc A scellé — additif autorisé, ADR 0019) : flag
-- d'activation de l'IA, OFF par défaut (comportement prod inchangé : stub partout tant que
-- non activé). Plus une vue d'agrégation des coûts par cabinet (visibilité, sans blocage).
-- Migration hand-written hors journal Drizzle, appliquée manuellement à la base partagée.

ALTER TABLE crm.cabinet
  ADD COLUMN IF NOT EXISTS extraction_ia_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN crm.cabinet.extraction_ia_active IS
  'Active la couche IA (classif/extraction/embeddings) pour CE cabinet. OFF par défaut. L''IA est live ssi EXTRACTION_MODE=live (kill-switch global maître) ET ce flag = true. Voir ADR 0023.';

-- Vue de suivi des coûts IA par cabinet (agrège extraction.invocation). Lecture monitoring /
-- future facturation à l'usage. Pas de RLS (vue ; le chemin app filtre par cabinet_id).
CREATE OR REPLACE VIEW extraction.v_cout_par_cabinet AS
SELECT
  i.cabinet_id,
  count(*)::bigint                              AS nb_invocations,
  coalesce(sum(i.cost_usd), 0)::numeric(14, 6)  AS cout_usd_total,
  coalesce(sum(i.tokens_input), 0)::bigint       AS tokens_input_total,
  coalesce(sum(i.tokens_output), 0)::bigint      AS tokens_output_total,
  max(i.created_at)                              AS derniere_invocation_at
FROM extraction.invocation i
GROUP BY i.cabinet_id;

COMMENT ON VIEW extraction.v_cout_par_cabinet IS
  'Agrégation des coûts/tokens IA par cabinet (ADR 0023). Monitoring + future facturation à l''usage.';
