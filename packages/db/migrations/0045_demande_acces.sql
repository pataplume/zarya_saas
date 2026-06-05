-- 0045 — Run D1 : demandes d'accès (prospects) depuis la page d'entrée publique.
-- PAS de cabinet_id : lead PRÉ-cabinet (public), hors multi-tenant — comme les catalogues
-- globaux / zefix_recherche. Exclue de METIER_TABLES/RLS_TABLES. Écriture via server action
-- (db service role) ; lecture réservée à l'équipe ZARYA (back-office futur).
-- Migration hand-written hors journal Drizzle, appliquée manuellement à la base partagée.
CREATE TABLE IF NOT EXISTS crm.demande_acces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  email       text NOT NULL,
  cabinet_nom text,
  message     text,
  statut      text NOT NULL DEFAULT 'nouvelle',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE crm.demande_acces IS
  'Demandes d''accès (prospects, pré-cabinet) depuis la page d''entrée publique. PAS de cabinet_id (lead public, hors multi-tenant) — exclue de METIER_TABLES/RLS_TABLES. Écriture via server action service-role.';

CREATE INDEX IF NOT EXISTS idx_demande_acces_statut ON crm.demande_acces (statut, created_at);
