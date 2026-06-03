-- ════════════════════════════════════════════════════════════════════════════
-- 0035 — Bloc F8 : vues filtrées du dashboard client (champs internes masqués).
--
-- ADDITIF (aucune table touchée). Le rôle client_contact ne lit JAMAIS les tables
-- directement (dashboard-client.md §13.2) : il passe par ces vues qui n'exposent que les
-- colonnes appropriées. Champs ULTRA-SENSIBLES (AVS/IBAN) : seul un booléen `*_renseigne`
-- est exposé — jamais le vault_id ni la valeur (arbitré founder : masqués, pas de déchiffrement).
-- Champs INTERNES exclus : notes fiduciaire, scoring, coûts IA, vault_id.
--
-- Scope applicatif : chaque vue porte cabinet_id + client_id ; les pages filtrent par le
-- client_id/cabinet_id portés (server-controlled) par l'app_metadata du JWT client_contact.
-- Réf : docs/modules/dashboard-client.md §6/§7/§9/§13 ; KICKOFF F8.
-- ════════════════════════════════════════════════════════════════════════════

-- Mon entreprise (§6) — fiche CRM consultable, champs publics uniquement.
CREATE OR REPLACE VIEW crm.v_dashboard_client_entreprise AS
SELECT
  c.id AS client_id,
  c.cabinet_id,
  c.raison_sociale,
  c.ide,
  c.forme_juridique,
  c.type,
  c.statut,
  c.created_at
FROM crm.client c
WHERE c.archived_at IS NULL;

-- Mes employés (§7) — référentiel, SANS AVS/IBAN en clair ni vault_id.
CREATE OR REPLACE VIEW salaire.v_dashboard_client_employe AS
SELECT
  e.id,
  e.cabinet_id,
  e.client_id,
  e.prenom,
  e.nom,
  e.fonction,
  e.departement,
  e.date_entree,
  e.date_sortie,
  e.taux_activite,
  e.type_contrat,
  e.statut,
  e.email,
  e.telephone,
  (e.numero_avs_vault_id IS NOT NULL) AS avs_renseigne,
  (e.iban_vault_id IS NOT NULL) AS iban_renseigne
FROM salaire.employe e
WHERE e.archived_at IS NULL;

-- Mes documents transmis (§9) — métadonnées de classement, pas de contenu interne.
CREATE OR REPLACE VIEW doc.v_dashboard_client_document AS
SELECT
  d.id,
  d.cabinet_id,
  d.client_id,
  d.type,
  d.categorie,
  d.periode,
  d.libelle,
  d.statut_classement,
  d.created_at
FROM doc.document d
WHERE d.client_id IS NOT NULL;

GRANT SELECT ON crm.v_dashboard_client_entreprise TO authenticated;
GRANT SELECT ON salaire.v_dashboard_client_employe TO authenticated;
GRANT SELECT ON doc.v_dashboard_client_document TO authenticated;
