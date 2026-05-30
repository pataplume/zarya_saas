-- Migration 0022 : doc.v_inbox_a_valider — vue de la file de validation (Bloc B7).
-- Réf : KICKOFF § BLOC B / B7 · docs/modules/doc.md §5 & §7 · docs/data-model/document-schema.md.
-- Forward-only, purement additif : une vue de lecture, aucune table touchée.
--
-- La vue dénormalise les propositions encore 'a_valider' avec : le client proposé
-- (raison sociale), les candidats homonymes (B2, client_candidats), les anomalies, et
-- les métadonnées d'origine (nom de fichier, mime, date de réception). Elle remplace les
-- joins manuels de la page /app/documents/validation.
--
-- security_invoker = true → la vue honore la RLS du rôle appelant. Sur le chemin app
-- (service-role, RLS contournée — ADR 0005 addendum), la frontière de sécurité réelle
-- reste le filtre `WHERE cabinet_id = X` discipliné côté applicatif ; la vue expose
-- donc `cabinet_id` pour permettre ce filtre. Ce n'est PAS une table métier (pas de
-- registre METIER_TABLES/RLS_TABLES, pas d'écriture).
--
-- NOTE schéma : le SQL historique de document-schema.md référençait `email_brut_id` et
-- `fp.nom_fichier_original` (colonnes absentes du schéma réel). Adapté ici : le nom
-- d'origine et la date viennent de doc.upload_brut (LEFT JOIN via fichier_physique).

CREATE OR REPLACE VIEW doc.v_inbox_a_valider
WITH (security_invoker = true) AS
SELECT
  p.id                                       AS proposition_id,
  p.cabinet_id,
  p.fichier_physique_id,
  p.client_id_propose,
  c.raison_sociale                           AS client_nom,
  p.type_propose,
  p.categorie_proposee,
  p.periode_proposee,
  p.libelle_propose,
  p.confiance_globale,
  p.client_candidats,
  p.anomalies_detectees,
  COALESCE(array_length(p.anomalies_detectees, 1), 0) AS nb_anomalies,
  ub.nom_fichier_original,
  fp.type_mime,
  COALESCE(ub.date_upload, fp.created_at)     AS date_reception,
  p.created_at
FROM doc.proposition_classement p
JOIN doc.fichier_physique fp ON fp.id = p.fichier_physique_id
LEFT JOIN doc.upload_brut ub ON ub.id = fp.upload_brut_id
LEFT JOIN crm.client c ON c.id = p.client_id_propose
WHERE p.statut = 'a_valider'
ORDER BY p.confiance_globale DESC NULLS LAST, p.created_at DESC;
