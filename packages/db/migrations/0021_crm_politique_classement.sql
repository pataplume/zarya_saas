-- Migration 0021 : Bloc B4 — politique d'auto-classement par cabinet.
-- Réf : docs/flows/flow-a-document-entrant.md §4 + ADR 0014 + KICKOFF Bloc B/B4.
-- Forward-only, purement additif : un enum + une colonne NOT NULL avec défaut sûr.
--
-- crm.cabinet.politique_classement régit la décision « auto-classement vs file de
-- validation » du pipeline Doc (flow-a §4) :
--   - strict      : toute proposition va en validation humaine (DÉFAUT, comportement
--                   MVP inchangé — les seuils 0.95/0.80 restent « inactifs en MVP »,
--                   cf. ADR 0014 ; aucun cabinet n'est auto sans opt-in explicite) ;
--   - hybride     : confiance_globale > 0.95 ET aucune anomalie → auto, sinon file ;
--   - aggressive  : confiance_globale > 0.80 → auto, sinon file.
-- La règle apprise (doc.regle_auto_classement, flow-a §4 Cas D) est Phase 2, hors-scope.
--
-- Multi-tenant : crm.cabinet est la racine du tenant (pas de cabinet_id, RLS exclue) —
-- aucune incidence isolation. Le défaut `strict` garantit que l'ajout de la colonne ne
-- change rien au comportement des cabinets existants.

CREATE TYPE crm.politique_classement AS ENUM ('strict', 'hybride', 'aggressive');

ALTER TABLE crm.cabinet
  ADD COLUMN IF NOT EXISTS politique_classement crm.politique_classement
  NOT NULL DEFAULT 'strict';
