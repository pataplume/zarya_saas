-- Snooze persistant des relances (RUN6 usabilité) — additif sur crm.relance ET salaire.relance,
-- pas de nouvelle table. snoozed_until : la relance redevient visible après cette date.
-- snoozed_par : qui a demandé le report (traçabilité), nullable (onDelete set null, comme
-- echeance.created_by).

ALTER TABLE crm.relance
  ADD COLUMN snoozed_until timestamptz,
  ADD COLUMN snoozed_par uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL;

CREATE INDEX idx_relance_snoozed_until ON crm.relance (cabinet_id, snoozed_until) WHERE snoozed_until IS NOT NULL;

ALTER TABLE salaire.relance
  ADD COLUMN snoozed_until timestamptz,
  ADD COLUMN snoozed_par uuid REFERENCES crm.cabinet_membre(id) ON DELETE SET NULL;

CREATE INDEX idx_relance_salaire_snoozed_until ON salaire.relance (cabinet_id, snoozed_until) WHERE snoozed_until IS NOT NULL;

-- La file de validation (calendar.v_relances_a_valider, migration 0027) doit exclure les
-- relances snoozées tant que la date n'est pas passée. CREATE OR REPLACE VIEW additif,
-- ne touche aucune table.
CREATE OR REPLACE VIEW calendar.v_relances_a_valider
WITH (security_invoker = true) AS
SELECT
  r.id                       AS relance_id,
  r.cabinet_id,
  r.client_id,
  c.raison_sociale           AS client_nom,
  c.nom_court                AS client_nom_court,
  r.echeance_id,
  e.libelle                  AS echeance_libelle,
  e.date_echeance,
  e.type                     AS echeance_type,
  e.statut                   AS echeance_statut,
  r.canal,
  r.destinataire_contact_id,
  ct.email                   AS destinataire_email,
  ct.nom                     AS destinataire_nom,
  r.sujet,
  r.corps,
  r.numero_dans_serie,
  r.created_at
FROM crm.relance r
JOIN crm.client c   ON c.id = r.client_id
LEFT JOIN crm.echeance e ON e.id = r.echeance_id
LEFT JOIN crm.contact ct ON ct.id = r.destinataire_contact_id
WHERE r.statut = 'brouillon'
  AND (r.snoozed_until IS NULL OR r.snoozed_until <= now());

GRANT SELECT ON calendar.v_relances_a_valider TO authenticated;
