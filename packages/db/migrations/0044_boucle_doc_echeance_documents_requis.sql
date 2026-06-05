-- 0044 — Boucle doc→échéance : enrichir les templates globaux avec documents_requis_types
-- (mapping validé founder 05/06) PUIS backfiller les échéances déjà générées (documents_requis
-- NULL). Ferme le chantier transverse C4 côté DONNÉES (le mécanisme existait déjà, migration 0029).
-- Idempotent (guards IS NULL). Vocabulaire aligné sur crm.standard_type_document (0017).
-- Migration hand-written hors journal Drizzle, appliquée manuellement à la base partagée.

-- 1) Enrichissement des templates globaux (cabinet_id IS NULL), par nom. Cas évidents fermes ;
--    Bouclement = gate minimal sur relevés ; LPP / impôt à la source laissés NULL (pas de slug
--    dédié au catalogue → on ne gate pas sur un document non classable, comportement sûr).
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['decompte_salaire']
  WHERE cabinet_id IS NULL AND nom = 'Validation salaire mensuel' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['declaration_tva']
  WHERE cabinet_id IS NULL AND nom = 'TVA trimestrielle (effective)' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['declaration_tva']
  WHERE cabinet_id IS NULL AND nom = 'TVA semestrielle' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['releve_bancaire']
  WHERE cabinet_id IS NULL AND nom = 'Bouclement annuel' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['declaration_impot']
  WHERE cabinet_id IS NULL AND nom = 'Déclaration impôt entreprise' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['certificat_salaire']
  WHERE cabinet_id IS NULL AND nom = 'Certificat de salaire annuel' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['declaration_avs']
  WHERE cabinet_id IS NULL AND nom = 'Décompte annuel AVS/AC' AND documents_requis_types IS NULL;
UPDATE calendar.template_echeance SET documents_requis_types = ARRAY['declaration_avs']
  WHERE cabinet_id IS NULL AND nom = 'Cotisations AVS trimestrielles' AND documents_requis_types IS NULL;
-- 'Relance relevés bancaires mensuels' = déjà ['releve_bancaire'] (0006) → inchangé.
-- 'Décompte annuel LPP' et 'Décompte annuel impôt à la source (IS)' → laissés NULL (pas de slug).

-- 2) Backfill des échéances existantes à documents_requis NULL : même résolution que
--    fn_generer_echeances (0029), via echeance.template_id → template.documents_requis_types →
--    crm.document_attendu du client de type matchant. Échéances sans match restent NULL (sûr).
UPDATE crm.echeance e
SET documents_requis = sub.ids, updated_at = now()
FROM (
  SELECT e2.id AS echeance_id, array_agg(da.id) AS ids
  FROM crm.echeance e2
  JOIN calendar.template_echeance t ON t.id = e2.template_id
  JOIN crm.document_attendu da
    ON da.client_id = e2.client_id
   AND da.cabinet_id = e2.cabinet_id
   AND da.archived_at IS NULL
   AND t.documents_requis_types IS NOT NULL
   AND da.type_document = ANY(t.documents_requis_types)
  WHERE e2.documents_requis IS NULL
    AND e2.archived_at IS NULL
  GROUP BY e2.id
) sub
WHERE e.id = sub.echeance_id;
