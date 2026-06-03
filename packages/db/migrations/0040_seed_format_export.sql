-- 0040 — Bloc G6a : seed des formats d'export salaire standard (globaux, cabinet_id NULL).
-- MVP (arbitré founder) : Excel humain + CSV générique. Formats logiciel-spécifiques
-- (Crésus/WinBIZ/Bexio) = différés (mappings « à valider interview », KICKOFF). Réf salaire-schema §14.
INSERT INTO salaire.format_export (cabinet_id, code, nom, logiciel_cible, format_fichier, separateur_csv, date_format)
VALUES
  (NULL, 'excel_humain', 'Excel lisible (humain)', 'autre', 'xlsx', NULL, 'DD.MM.YYYY'),
  (NULL, 'csv_generique', 'CSV générique', 'autre', 'csv', ';', 'DD.MM.YYYY')
ON CONFLICT DO NOTHING;
