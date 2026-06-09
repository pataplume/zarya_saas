-- 0049 — Ingestion email : doc.upload_brut.uploaded_par devient NULLABLE.
-- Un upload manuel a un uploader humain ; une ingestion SYSTÈME (pièce jointe d'email
-- Microsoft, cron) n'en a pas. On relâche la contrainte NOT NULL (NULL = ingestion système).
-- Additif (relâche une contrainte ; aucune donnée existante invalidée).
ALTER TABLE doc.upload_brut ALTER COLUMN uploaded_par DROP NOT NULL;
