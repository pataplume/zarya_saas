-- 0050 — UX Documents : relier un document ingéré à l'email d'origine.
-- `doc.upload_brut.email_brut_id` (nullable, SET NULL) : renseigné quand la pièce provient
-- d'une pièce jointe d'email (source email_microsoft). Permet « cet email → a produit N
-- documents » et « ce document → reçu par email de … » dans l'UI. Additif, idempotent.
ALTER TABLE doc.upload_brut
  ADD COLUMN IF NOT EXISTS email_brut_id uuid
    REFERENCES doc.email_brut(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_upload_brut_email
  ON doc.upload_brut (cabinet_id, email_brut_id);
