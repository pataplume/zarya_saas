-- Run I2 — Profil fiduciaire complet : enrichit crm.cabinet_membre avec le téléphone
-- et la signature email du membre. Colonnes ADDITIVES nullables (hors sceau Bloc A : on
-- n'altère aucune colonne existante). La signature alimentera l'envoi des relances
-- (param `signature` de sendCabinetEmail, D5) ; le câblage côté cron est différé.
ALTER TABLE crm.cabinet_membre
  ADD COLUMN telephone      text,
  ADD COLUMN signature_email text;
