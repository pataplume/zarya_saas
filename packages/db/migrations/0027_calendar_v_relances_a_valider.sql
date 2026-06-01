-- Migration 0027 : Bloc C2a — vue calendar.v_relances_a_valider.
-- Réf : docs/data-model/echeance-schema.md §10 (vues), flow-c §74/§87 (file de
-- validation des relances, Mode A). Additif (CREATE VIEW), ne touche aucune table.
--
-- File de validation des relances en BROUILLON (générées par le cron C2a), dénormalisée
-- pour l'UI (C3) : relance + client + échéance + destinataire. security_invoker = true →
-- s'exécute avec les droits de l'appelant ; le chemin app (service role) filtre cabinet_id
-- explicitement (frontière de sécurité réelle, ADR 0005 addendum). PAS une table métier.

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
WHERE r.statut = 'brouillon';

GRANT SELECT ON calendar.v_relances_a_valider TO authenticated;
