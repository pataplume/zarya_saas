-- Migration 0017 : Fondation CRM — Bloc A9 (catalogues globaux crm.standard_*)
-- Réf : ADR 0012 (séquence canonique) + docs/data-model/crm-schema.md §20.
-- Forward-only, purement additif : quatre tables de référence, aucun changement sur l'existant.
--
-- EXCEPTION DOCUMENTÉE à la règle multi-tenant (packages/db/CLAUDE.md §1, crm-schema.md
-- §20/§22.3) : ces tables sont des CATALOGUES GLOBAUX partagés par tous les cabinets,
-- donc SANS cabinet_id et en LECTURE SEULE. RLS DÉSACTIVÉE (lecture publique pour les
-- rôles authentifiés). Elles n'ont aucun tenant à isoler → exclues de METIER_TABLES /
-- RLS_TABLES du test anti-fuite.
--
-- Les seeds ci-dessous sont des DONNÉES DE RÉFÉRENCE PERMANENTES (pas du seed de dev),
-- idempotentes via ON CONFLICT DO NOTHING.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. crm.standard_categorie_document — Catégories standard (aligné doc.categorie_document)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.standard_categorie_document (
  code        text PRIMARY KEY,
  libelle     text NOT NULL,
  ordre       integer NOT NULL DEFAULT 0,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. crm.standard_type_document — Types standard ZARYA (vocabulaire de classification)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.standard_type_document (
  code            text PRIMARY KEY,
  libelle         text NOT NULL,
  categorie_code  text NOT NULL REFERENCES crm.standard_categorie_document(code) ON DELETE RESTRICT,
  ordre           integer NOT NULL DEFAULT 0,
  actif           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standard_type_document_categorie
  ON crm.standard_type_document (categorie_code);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. crm.standard_canton_ch — 26 cantons suisses (noms multilingues)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.standard_canton_ch (
  code        text PRIMARY KEY,
  nom_fr      text NOT NULL,
  nom_de      text NOT NULL,
  nom_it      text,
  numero      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. crm.standard_caisse_avs — Caisses de compensation AVS (référentiel)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm.standard_caisse_avs (
  code        text PRIMARY KEY,
  nom         text NOT NULL,
  type        text,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Lecture publique (RLS désactivée — §22.3). Pas d'ENABLE ROW LEVEL SECURITY.
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON crm.standard_categorie_document TO authenticated, anon;
GRANT SELECT ON crm.standard_type_document      TO authenticated, anon;
GRANT SELECT ON crm.standard_canton_ch          TO authenticated, anon;
GRANT SELECT ON crm.standard_caisse_avs         TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Seeds de référence permanents (idempotents)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO crm.standard_categorie_document (code, libelle, ordre) VALUES
  ('bancaire',      'Bancaire',      1),
  ('fiscal',        'Fiscal',        2),
  ('salaire',       'Salaire',       3),
  ('commercial',    'Commercial',    4),
  ('administratif', 'Administratif', 5),
  ('autre',         'Autre',         6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO crm.standard_type_document (code, libelle, categorie_code, ordre) VALUES
  ('releve_bancaire',        'Relevé bancaire',         'bancaire',      1),
  ('facture_fournisseur',    'Facture fournisseur',     'commercial',    2),
  ('declaration_tva',        'Déclaration TVA',         'fiscal',        3),
  ('declaration_impot',      'Déclaration d''impôt',    'fiscal',        4),
  ('certificat_salaire',     'Certificat de salaire',   'fiscal',        5),
  ('decompte_salaire',       'Décompte de salaire',     'salaire',       6),
  ('contrat_travail',        'Contrat de travail',      'salaire',       7),
  ('avenant_contrat',        'Avenant au contrat',      'salaire',       8),
  ('declaration_avs',        'Déclaration AVS',         'salaire',       9),
  ('document_administratif', 'Document administratif',  'administratif', 10),
  ('a_classer',              'À classer',               'autre',         11)
ON CONFLICT (code) DO NOTHING;

INSERT INTO crm.standard_canton_ch (code, nom_fr, nom_de, nom_it, numero) VALUES
  ('ZH', 'Zurich',                          'Zürich',                  'Zurigo',              1),
  ('BE', 'Berne',                           'Bern',                    'Berna',               2),
  ('LU', 'Lucerne',                         'Luzern',                  'Lucerna',             3),
  ('UR', 'Uri',                             'Uri',                     'Uri',                 4),
  ('SZ', 'Schwytz',                         'Schwyz',                  'Svitto',              5),
  ('OW', 'Obwald',                          'Obwalden',                'Obvaldo',             6),
  ('NW', 'Nidwald',                         'Nidwalden',               'Nidvaldo',            7),
  ('GL', 'Glaris',                          'Glarus',                  'Glarona',             8),
  ('ZG', 'Zoug',                            'Zug',                     'Zugo',                9),
  ('FR', 'Fribourg',                        'Freiburg',                'Friburgo',           10),
  ('SO', 'Soleure',                         'Solothurn',               'Soletta',            11),
  ('BS', 'Bâle-Ville',                      'Basel-Stadt',             'Basilea Città',      12),
  ('BL', 'Bâle-Campagne',                   'Basel-Landschaft',        'Basilea Campagna',   13),
  ('SH', 'Schaffhouse',                     'Schaffhausen',            'Sciaffusa',          14),
  ('AR', 'Appenzell Rhodes-Extérieures',    'Appenzell Ausserrhoden',  'Appenzello Esterno', 15),
  ('AI', 'Appenzell Rhodes-Intérieures',    'Appenzell Innerrhoden',   'Appenzello Interno', 16),
  ('SG', 'Saint-Gall',                      'St. Gallen',              'San Gallo',          17),
  ('GR', 'Grisons',                         'Graubünden',              'Grigioni',           18),
  ('AG', 'Argovie',                         'Aargau',                  'Argovia',            19),
  ('TG', 'Thurgovie',                       'Thurgau',                 'Turgovia',           20),
  ('TI', 'Tessin',                          'Tessin',                  'Ticino',             21),
  ('VD', 'Vaud',                            'Waadt',                   'Vaud',               22),
  ('VS', 'Valais',                          'Wallis',                  'Vallese',            23),
  ('NE', 'Neuchâtel',                       'Neuenburg',               'Neuchâtel',          24),
  ('GE', 'Genève',                          'Genf',                    'Ginevra',            25),
  ('JU', 'Jura',                            'Jura',                    'Giura',              26)
ON CONFLICT (code) DO NOTHING;

INSERT INTO crm.standard_caisse_avs (code, nom, type) VALUES
  ('ZH', 'Caisse cantonale de compensation de Zurich',                          'cantonale'),
  ('BE', 'Caisse cantonale de compensation de Berne',                           'cantonale'),
  ('LU', 'Caisse cantonale de compensation de Lucerne',                         'cantonale'),
  ('UR', 'Caisse cantonale de compensation d''Uri',                             'cantonale'),
  ('SZ', 'Caisse cantonale de compensation de Schwytz',                         'cantonale'),
  ('OW', 'Caisse cantonale de compensation d''Obwald',                          'cantonale'),
  ('NW', 'Caisse cantonale de compensation de Nidwald',                         'cantonale'),
  ('GL', 'Caisse cantonale de compensation de Glaris',                          'cantonale'),
  ('ZG', 'Caisse cantonale de compensation de Zoug',                            'cantonale'),
  ('FR', 'Caisse cantonale de compensation de Fribourg',                        'cantonale'),
  ('SO', 'Caisse cantonale de compensation de Soleure',                         'cantonale'),
  ('BS', 'Caisse cantonale de compensation de Bâle-Ville',                      'cantonale'),
  ('BL', 'Caisse cantonale de compensation de Bâle-Campagne',                   'cantonale'),
  ('SH', 'Caisse cantonale de compensation de Schaffhouse',                     'cantonale'),
  ('AR', 'Caisse cantonale de compensation d''Appenzell Rhodes-Extérieures',    'cantonale'),
  ('AI', 'Caisse cantonale de compensation d''Appenzell Rhodes-Intérieures',    'cantonale'),
  ('SG', 'Caisse cantonale de compensation de Saint-Gall',                      'cantonale'),
  ('GR', 'Caisse cantonale de compensation des Grisons',                        'cantonale'),
  ('AG', 'Caisse cantonale de compensation d''Argovie',                         'cantonale'),
  ('TG', 'Caisse cantonale de compensation de Thurgovie',                       'cantonale'),
  ('TI', 'Caisse cantonale de compensation du Tessin',                          'cantonale'),
  ('VD', 'Caisse cantonale vaudoise de compensation',                           'cantonale'),
  ('VS', 'Caisse cantonale de compensation du Valais',                          'cantonale'),
  ('NE', 'Caisse cantonale neuchâteloise de compensation',                      'cantonale'),
  ('GE', 'Caisse cantonale genevoise de compensation',                          'cantonale'),
  ('JU', 'Caisse cantonale de compensation du Jura',                            'cantonale')
ON CONFLICT (code) DO NOTHING;
