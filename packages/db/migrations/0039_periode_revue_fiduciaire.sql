-- ════════════════════════════════════════════════════════════════════════════
-- 0039 — Bloc G4b : jalon de revue fiduciaire sur la période (« validee_cabinet »).
--
-- ADDITIF (arbitré founder) : 2 colonnes sur salaire.periode. La revue fiduciaire est un
-- JALON distinct de la validation (le statut reste 'validee' ; salaire.validation.valide_par_type
-- distingue déjà client/fiduciaire). L'export (G6) exigera revue_fiduciaire_at non nul.
-- Pas de nouvelle valeur d'enum statut_periode (moins risqué). Réf : salaire.md §6 ; KICKOFF G4.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE salaire.periode
  ADD COLUMN revue_fiduciaire_at timestamptz,
  ADD COLUMN revue_fiduciaire_par uuid;
