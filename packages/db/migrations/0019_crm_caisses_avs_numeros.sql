-- Migration 0019 : Correction/enrichissement crm.standard_caisse_avs — vrais numéros AVS officiels
-- Réf : ADR 0012 (catalogue de référence « jamais reshapé ») + crm-schema.md §20.
-- Source : ahv-iv.ch (Centre d'information AVS/AI) — pages Contacts officielles :
--   • Caisses cantonales de compensation        (numéros 1–25, + Jura = 150)
--   • Caisse fédérale de compensation CFC        (numéro 26.1)
--   • Caisse suisse de compensation CSC          (numéro 27)
--   • Caisses de compensation professionnelles   (numéros 28–117, avec sous-numéros)
--
-- Forward-only. CORRECTION de seed sur un CATALOGUE GLOBAL (pas de donnée tenant, aucun
-- FK entrant) : en A9 (migration 0017) la PK `code` portait le CODE CANTON (ZH, BE…) ; on
-- la repositionne sur le VRAI NUMÉRO DE CAISSE officiel (clé naturelle stable), et on
-- ajoute la colonne `canton` (FK crm.standard_canton_ch) pour rattacher les cantonales.
-- RLS toujours désactivée, lecture publique (exception documentée §20/§22.3) — inchangé.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Schéma : colonne `canton` (rattachement des caisses cantonales à leur canton)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm.standard_caisse_avs
  ADD COLUMN IF NOT EXISTS canton text REFERENCES crm.standard_canton_ch(code) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_standard_caisse_avs_canton
  ON crm.standard_caisse_avs (canton);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Purge des seeds A9 (codes = codes canton, sans numéro) avant re-seed par numéro
-- ════════════════════════════════════════════════════════════════════════════
-- Les anciennes lignes avaient code IN ('ZH','BE',…) — purement non numériques.
-- On ne supprime QUE celles-là (idempotent : ré-exécution = no-op après re-seed).

DELETE FROM crm.standard_caisse_avs WHERE code !~ '^[0-9]';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Re-seed par numéro de caisse officiel (idempotent : ON CONFLICT DO NOTHING)
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Caisses cantonales (numéros 1–25 dans l'ordre officiel des cantons, + Jura 150)
INSERT INTO crm.standard_caisse_avs (code, nom, type, canton) VALUES
  ('1', 'SVA Zürich', 'cantonale', 'ZH'),
  ('2', 'Caisse de compensation du canton de Berne', 'cantonale', 'BE'),
  ('3', 'WAS Ausgleichskasse Luzern', 'cantonale', 'LU'),
  ('4', 'Sozialversicherungsstelle Uri', 'cantonale', 'UR'),
  ('5', 'SVA Schwyz', 'cantonale', 'SZ'),
  ('6', 'Ausgleichskasse Obwalden', 'cantonale', 'OW'),
  ('7', 'Ausgleichskasse Nidwalden', 'cantonale', 'NW'),
  ('8', 'Sozialversicherungen Glarus', 'cantonale', 'GL'),
  ('9', 'Ausgleichskasse Zug', 'cantonale', 'ZG'),
  ('10', 'Caisse de compensation du canton de Fribourg', 'cantonale', 'FR'),
  ('11', 'Ausgleichskasse des Kantons Solothurn', 'cantonale', 'SO'),
  ('12', 'Ausgleichskasse Basel-Stadt', 'cantonale', 'BS'),
  ('13', 'SVA Basel-Landschaft', 'cantonale', 'BL'),
  ('14', 'SVA Schaffhausen', 'cantonale', 'SH'),
  ('15', 'Sozialversicherungen Appenzell Ausserrhoden', 'cantonale', 'AR'),
  ('16', 'Ausgleichskasse Appenzell Innerrhoden', 'cantonale', 'AI'),
  ('17', 'SVA St.Gallen', 'cantonale', 'SG'),
  ('18', 'Sozialversicherungsanstalt des Kantons Graubünden', 'cantonale', 'GR'),
  ('19', 'SVA Aargau', 'cantonale', 'AG'),
  ('20', 'Sozialversicherungszentrum Thurgau', 'cantonale', 'TG'),
  ('21', 'Istituto delle assicurazioni sociali', 'cantonale', 'TI'),
  ('22', 'Caisse cantonale vaudoise de compensation', 'cantonale', 'VD'),
  ('23', 'Caisse de compensation du canton du Valais', 'cantonale', 'VS'),
  ('24', 'Caisse cantonale neuchâteloise de compensation', 'cantonale', 'NE'),
  ('25', 'Caisse genevoise de compensation', 'cantonale', 'GE'),
  ('150', 'Etablissement cantonal des assurances sociales (Jura)', 'cantonale', 'JU')
ON CONFLICT (code) DO NOTHING;

-- 3b. Caisses fédérales (CFC 26.1, CSC 27)
INSERT INTO crm.standard_caisse_avs (code, nom, type, canton) VALUES
  ('26.1', 'Caisse fédérale de compensation CFC', 'federale', NULL),
  ('27', 'Caisse suisse de compensation CSC', 'federale', NULL)
ON CONFLICT (code) DO NOTHING;

-- 3c. Caisses de compensation professionnelles (numéros 28–117, sous-numéros inclus)
INSERT INTO crm.standard_caisse_avs (code, nom, type, canton) VALUES
  ('28', 'Caisse de compensation medisuisse', 'professionnelle', NULL),
  ('30', 'Caisse de compensation AVS IMOREK', 'professionnelle', NULL),
  ('31', 'Caisse de compensation Coop', 'professionnelle', NULL),
  ('32', 'Ostschweizerische Ausgleichskasse für Handel und Industrie', 'professionnelle', NULL),
  ('33', 'Caisse de compensation MOBIL', 'professionnelle', NULL),
  ('34', 'Caisse de compensation AVS des Bouchers', 'professionnelle', NULL),
  ('35', 'Caisse de compensation scienceINDUSTRIES', 'professionnelle', NULL),
  ('37', 'Caisse de compensation des Centrales Suisses d''Electricité', 'professionnelle', NULL),
  ('38', 'Caisse de compensation PANVICA', 'professionnelle', NULL),
  ('40', 'Caisse de compensation employeurs Bâle', 'professionnelle', NULL),
  ('44', 'Hotela Caisse de compensation', 'professionnelle', NULL),
  ('46', 'GastroSocial Caisse de compensation', 'professionnelle', NULL),
  ('46.3', 'GastroSocial Cassa di compensazione (Succursale Lugano)', 'professionnelle', NULL),
  ('48', 'Ausgleichskasse der AIHK', 'professionnelle', NULL),
  ('51', 'Caisse de compensation AVS de l''Industrie Horlogère', 'professionnelle', NULL),
  ('51.3', 'Caisse de compensation AVS de l''Industrie Horlogère (agence 51.3)', 'professionnelle', NULL),
  ('51.4', 'Caisse de compensation AVS de l''Industrie Horlogère (51.4)', 'professionnelle', NULL),
  ('51.5', 'Caisse de compensation de l''Industrie Horlogère (51.5)', 'professionnelle', NULL),
  ('51.7', 'Caisse de compensation de l''Industrie Horlogère (51.7)', 'professionnelle', NULL),
  ('51.10', 'Caisse de compensation de l''Industrie Horlogère (51.10)', 'professionnelle', NULL),
  ('55', 'Ausgleichskasse Gewerbe Thurgau-Schaffhausen', 'professionnelle', NULL),
  ('59', 'Caisses interprofessionnelles neuchâteloises de compensation', 'professionnelle', NULL),
  ('60', 'Caisse de compensation Swissmem', 'professionnelle', NULL),
  ('61', 'Caisse de compensation NODE AVS', 'professionnelle', NULL),
  ('63', 'Caisse de compensation patrons bernois', 'professionnelle', NULL),
  ('65', 'Ausgleichskasse Zürcher Arbeitgeber', 'professionnelle', NULL),
  ('66', 'consimo - Caisse de compensation 66 SBV', 'professionnelle', NULL),
  ('66.1', 'Caisse de compensation des entrepreneurs vaudois', 'professionnelle', NULL),
  ('66.2', 'Caisses de Compensation du Bâtiment', 'professionnelle', NULL),
  ('66.3', 'Cassa di compensazione della Società Svizzera Impresari Costruttori', 'professionnelle', NULL),
  ('69', 'Caisse de compensation transport', 'professionnelle', NULL),
  ('70', 'Caisse de compensation AVS Migros', 'professionnelle', NULL),
  ('71', 'Caisse de compensation Commerce Suisse', 'professionnelle', NULL),
  ('74', 'Caisse de compensation Albicolac', 'professionnelle', NULL),
  ('78', 'Caisse AVS pour les organisations laitières et agricoles', 'professionnelle', NULL),
  ('79', 'Spida AHV-Ausgleichskasse', 'professionnelle', NULL),
  ('81', 'Caisse de compensation «Assurance»', 'professionnelle', NULL),
  ('87', 'Ausgleichskasse Wirtschaft Graubünden Glarus', 'professionnelle', NULL),
  ('89', 'Caisse de compensation des banques suisses', 'professionnelle', NULL),
  ('95', 'Caisse de compensation AVS EXFOUR', 'professionnelle', NULL),
  ('98', 'Caisse de compensation Forte', 'professionnelle', NULL),
  ('99', 'PROMEA Caisse de compensation', 'professionnelle', NULL),
  ('103', 'Caisse de compensation de la branche de la communication', 'professionnelle', NULL),
  ('105', 'Caisse de compensation des arts et métiers Suisses', 'professionnelle', NULL),
  ('106', 'Caisse interprofessionnelle AVS - FER CIAV', 'professionnelle', NULL),
  ('106.1', 'Caisse interprofessionnelle AVS - FER CIAM', 'professionnelle', NULL),
  ('106.2', 'Caisse de compensation FER CIFA', 'professionnelle', NULL),
  ('106.3', 'Caisse interprofessionnelle AVS - FER CIGA', 'professionnelle', NULL),
  ('106.4', 'Caisse interprofessionnelle AVS - FER CIAN', 'professionnelle', NULL),
  ('106.5', 'Caisse de compensation AVS/AI - FER CIAB', 'professionnelle', NULL),
  ('106.7', 'Caisse interprofessionnelle AVS - FER Valais', 'professionnelle', NULL),
  ('107', 'Caisse de compensation commerçants bernois', 'professionnelle', NULL),
  ('109', 'Caisses sociales de la CVCI', 'professionnelle', NULL),
  ('110', 'Caisse AVS de la Fédération patronale vaudoise', 'professionnelle', NULL),
  ('111', 'MEROBA Caisse de compensation', 'professionnelle', NULL),
  ('112', 'Ausgleichskasse Gewerbe St. Gallen', 'professionnelle', NULL),
  ('113', 'Caisse AVS Coiffure & Esthétique', 'professionnelle', NULL),
  ('114', 'Ausgleichskasse Wirtschaftskammer Baselland', 'professionnelle', NULL),
  ('115', 'Caisse de compensation cliniques privées', 'professionnelle', NULL),
  ('116', 'Caisse de compensation AVS agricole, viticole et rurale Agrivit', 'professionnelle', NULL),
  ('117', 'consimo - Ausgleichskasse 117 swisstempcomp', 'professionnelle', NULL)
ON CONFLICT (code) DO NOTHING;
