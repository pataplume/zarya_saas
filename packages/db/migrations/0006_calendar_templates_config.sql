-- Migration 0006 : Module Calendar — Run 2 (templates, config, pauses)
-- Crée le schéma calendar.* : template_echeance + modele_relance (catalogues
-- globaux ZARYA + overrides cabinet), cabinet_config, pause_client.
-- + enums, RLS multi-tenant (catalogue global = lecture des lignes NULL pour tous),
-- trigger de cohérence cabinet/client réutilisé, grants, et seed (6 templates de
-- génération + 12 modèles de relance FR/DE/IT). Forward-only, purement additif.
--
-- Périmètre (ADR 0011) : cœur génération & config. Différés (Run 7) :
--   - calendar.evenement_outlook + colonnes Outlook sur crm.echeance/relance
--   - vues calendar.v_* + jobs pg_cron (génération / transitions / escalade)
--
-- Multi-tenant strict (ADR 0005). Les catalogues globaux (cabinet_id NULL) sont
-- une exception documentée (« catalogues globaux », cf. packages/db/CLAUDE.md § 1) :
-- lisibles par tous les tenants, modifiables uniquement via service role / migration.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Schéma + enums
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS calendar;

CREATE TYPE calendar.frequence_echeance AS ENUM (
  'mensuelle', 'trimestrielle', 'semestrielle', 'annuelle', 'ponctuelle', 'evenement'
);

CREATE TYPE calendar.politique_relance AS ENUM (
  'validation_humaine_systematique', 'auto_premiere_relance', 'auto_complete'
);

CREATE TYPE calendar.langue AS ENUM ('fr', 'de', 'it');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. calendar.template_echeance — Règles de génération récurrente
-- Catalogue global ZARYA (cabinet_id NULL) + overrides cabinet. type_echeance
-- réutilise crm.type_echeance (aligné sur crm.echeance.type).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE calendar.template_echeance (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id              uuid REFERENCES crm.cabinet(id) ON DELETE RESTRICT,  -- NULL = global
  nom                     text NOT NULL,
  type_echeance           crm.type_echeance NOT NULL,
  frequence               calendar.frequence_echeance NOT NULL,
  service_requis          text[],
  canton_specifique       text[],
  regime_tva              text[],
  jour_du_mois            integer,
  mois_dans_annee         integer[],
  date_specifique         date,
  delai_alerte_jours      integer NOT NULL DEFAULT 7,
  jours_entre_relances    integer NOT NULL DEFAULT 3,
  max_relances_auto       integer NOT NULL DEFAULT 3,
  documents_requis_types  text[],
  herite_de_id            uuid REFERENCES calendar.template_echeance(id) ON DELETE SET NULL,
  description             text,
  actif                   boolean NOT NULL DEFAULT true,
  created_by              uuid,  -- auth.users, pas de FK
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_echeance_lookup ON calendar.template_echeance (cabinet_id, type_echeance, actif);
CREATE INDEX idx_template_echeance_herite ON calendar.template_echeance (herite_de_id);
-- Unicité des templates globaux par nom (les overrides cabinet ne sont pas contraints).
CREATE UNIQUE INDEX uniq_template_echeance_global_nom ON calendar.template_echeance (nom) WHERE cabinet_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. calendar.modele_relance — Formulation Handlebars des relances
-- Catalogue global ZARYA (cabinet_id NULL) + overrides cabinet.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE calendar.modele_relance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id      uuid REFERENCES crm.cabinet(id) ON DELETE RESTRICT,  -- NULL = global
  type_echeance   crm.type_echeance NOT NULL,
  langue          calendar.langue NOT NULL,
  nom             text NOT NULL,
  objet           text NOT NULL,  -- Handlebars : "Rappel — {{echeance_libelle}}"
  corps           text NOT NULL,  -- Handlebars
  numero_relance  integer,
  actif           boolean NOT NULL DEFAULT true,
  created_by      uuid,  -- auth.users, pas de FK
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_modele_relance_lookup ON calendar.modele_relance (cabinet_id, type_echeance, langue, actif);
CREATE UNIQUE INDEX uniq_modele_relance_global ON calendar.modele_relance (type_echeance, langue) WHERE cabinet_id IS NULL;
CREATE UNIQUE INDEX uniq_modele_relance_cabinet ON calendar.modele_relance (cabinet_id, type_echeance, langue) WHERE cabinet_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. calendar.cabinet_config — Paramètres calendrier par cabinet (1 ligne/cabinet)
-- Défauts alignés ADR 0011 : pause 7 j ouvrés (§5), bulk 50/30 (§6), Mode A (§4).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE calendar.cabinet_config (
  cabinet_id                   uuid PRIMARY KEY REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  politique_relance_defaut     calendar.politique_relance NOT NULL DEFAULT 'validation_humaine_systematique',
  politique_relance_par_type   jsonb,
  delai_alerte_defaut_jours    integer NOT NULL DEFAULT 7,
  delais_par_type              jsonb,
  pause_apres_reponse_jours    integer NOT NULL DEFAULT 7,
  pause_si_reunion_jours       integer NOT NULL DEFAULT 7,
  max_relances_avant_escalade  integer NOT NULL DEFAULT 3,
  bulk_max_par_envoi           integer NOT NULL DEFAULT 50,
  bulk_throttle_par_minute     integer NOT NULL DEFAULT 30,
  fermetures_annuelles         jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. calendar.pause_client — Pauses de relance par client
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE calendar.pause_client (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id              uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  client_id               uuid NOT NULL REFERENCES crm.client(id) ON DELETE RESTRICT,
  demande_par             uuid,  -- auth.users, pas de FK
  date_debut              date NOT NULL,
  date_fin                date NOT NULL,
  motif                   text,
  types_echeances_paused  text[],
  actif                   boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pause_client_lookup ON calendar.pause_client (cabinet_id, client_id, date_debut, date_fin);

-- Cohérence cabinet/client : réutilise la fonction du module Run 1 (migration 0005).
CREATE TRIGGER trg_check_client_cabinet_pause
  BEFORE INSERT OR UPDATE ON calendar.pause_client
  FOR EACH ROW EXECUTE FUNCTION crm.fn_check_client_cabinet();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS multi-tenant
-- Catalogues globaux (template_echeance, modele_relance) : SELECT inclut les
-- lignes globales (cabinet_id IS NULL) ; écritures limitées aux overrides cabinet.
-- cabinet_config / pause_client : isolation standard.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE calendar.template_echeance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON calendar.template_echeance
  FOR SELECT USING (cabinet_id = current_cabinet_id() OR cabinet_id IS NULL);
CREATE POLICY "tenant_isolation_insert" ON calendar.template_echeance
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON calendar.template_echeance
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON calendar.template_echeance
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE calendar.modele_relance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON calendar.modele_relance
  FOR SELECT USING (cabinet_id = current_cabinet_id() OR cabinet_id IS NULL);
CREATE POLICY "tenant_isolation_insert" ON calendar.modele_relance
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON calendar.modele_relance
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON calendar.modele_relance
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE calendar.cabinet_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON calendar.cabinet_config
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON calendar.cabinet_config
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON calendar.cabinet_config
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON calendar.cabinet_config
  FOR DELETE USING (cabinet_id = current_cabinet_id());

ALTER TABLE calendar.pause_client ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_select" ON calendar.pause_client
  FOR SELECT USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_insert" ON calendar.pause_client
  FOR INSERT WITH CHECK (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_update" ON calendar.pause_client
  FOR UPDATE USING (cabinet_id = current_cabinet_id());
CREATE POLICY "tenant_isolation_delete" ON calendar.pause_client
  FOR DELETE USING (cabinet_id = current_cabinet_id());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Grants — rôle authenticated (la RLS filtre les lignes)
-- ════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA calendar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA calendar TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA calendar GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Seed — templates de génération standard ZARYA (catalogue global)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO calendar.template_echeance
  (cabinet_id, nom, type_echeance, frequence, service_requis, regime_tva,
   jour_du_mois, mois_dans_annee, delai_alerte_jours, documents_requis_types, description)
VALUES
  (NULL, 'Validation salaire mensuel', 'salaire', 'mensuelle',
   ARRAY['salaire'], NULL, 25, NULL, 7, NULL,
   'Validation mensuelle des salaires avant traitement.'),
  (NULL, 'TVA trimestrielle (effective)', 'tva', 'trimestrielle',
   ARRAY['comptabilite'], ARRAY['effective_trimestre'], NULL, ARRAY[2,5,8,11], 14, NULL,
   'Décompte TVA trimestriel (méthode effective).'),
  (NULL, 'TVA semestrielle', 'tva', 'semestrielle',
   ARRAY['comptabilite'], ARRAY['effective_semestre','forfaitaire_semestre'], NULL, ARRAY[2,8], 14, NULL,
   'Décompte TVA semestriel.'),
  (NULL, 'Bouclement annuel', 'bouclement', 'annuelle',
   ARRAY['comptabilite'], NULL, NULL, ARRAY[3], 30, NULL,
   'Clôture comptable annuelle.'),
  (NULL, 'Déclaration impôt entreprise', 'fiscale', 'annuelle',
   ARRAY['fiscalite'], NULL, NULL, ARRAY[9], 30, NULL,
   'Déclaration fiscale annuelle de la société.'),
  (NULL, 'Relance relevés bancaires mensuels', 'relance_documents', 'mensuelle',
   ARRAY['comptabilite'], NULL, 5, NULL, 3, ARRAY['releve_bancaire'],
   'Relance mensuelle des relevés bancaires manquants.');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Seed — modèles de relance (catalogue global) : 4 contextes × 3 langues
-- Variables Handlebars : {{client_nom}}, {{echeance_libelle}}, {{date_echeance}},
-- {{responsable_nom}}, {{cabinet_nom}}.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO calendar.modele_relance (cabinet_id, type_echeance, langue, nom, objet, corps)
VALUES
  -- ── TVA ──
  (NULL, 'tva', 'fr', 'Relance TVA (FR)',
   $h$Rappel — décompte TVA à préparer pour {{client_nom}}$h$,
   $h$Bonjour,

Nous préparons le décompte TVA de {{client_nom}}, dont l'échéance est fixée au {{date_echeance}} ({{echeance_libelle}}). Merci de nous transmettre les pièces manquantes afin que nous puissions le finaliser dans les délais.

Meilleures salutations,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'tva', 'de', 'MWST-Erinnerung (DE)',
   $h$Erinnerung — MWST-Abrechnung für {{client_nom}} vorzubereiten$h$,
   $h$Guten Tag,

Wir bereiten die MWST-Abrechnung von {{client_nom}} vor, deren Frist auf den {{date_echeance}} ({{echeance_libelle}}) festgelegt ist. Bitte senden Sie uns die fehlenden Unterlagen, damit wir sie fristgerecht abschliessen können.

Freundliche Grüsse,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'tva', 'it', 'Promemoria IVA (IT)',
   $h$Promemoria — rendiconto IVA da preparare per {{client_nom}}$h$,
   $h$Buongiorno,

Stiamo preparando il rendiconto IVA di {{client_nom}}, la cui scadenza è fissata al {{date_echeance}} ({{echeance_libelle}}). Vi preghiamo di trasmetterci i documenti mancanti affinché possiamo finalizzarlo nei termini.

Cordiali saluti,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  -- ── Salaire ──
  (NULL, 'salaire', 'fr', 'Relance salaires (FR)',
   $h$Rappel — validation des salaires de {{client_nom}}$h$,
   $h$Bonjour,

La validation des salaires de {{client_nom}} ({{echeance_libelle}}) est attendue pour le {{date_echeance}}. Merci de vérifier et de valider les éléments variables (heures, primes, absences) afin que le traitement soit lancé à temps.

Meilleures salutations,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'salaire', 'de', 'Lohn-Erinnerung (DE)',
   $h$Erinnerung — Freigabe der Löhne von {{client_nom}}$h$,
   $h$Guten Tag,

Die Freigabe der Löhne von {{client_nom}} ({{echeance_libelle}}) wird bis zum {{date_echeance}} erwartet. Bitte prüfen und bestätigen Sie die variablen Elemente (Stunden, Prämien, Absenzen), damit die Verarbeitung rechtzeitig erfolgen kann.

Freundliche Grüsse,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'salaire', 'it', 'Promemoria stipendi (IT)',
   $h$Promemoria — convalida degli stipendi di {{client_nom}}$h$,
   $h$Buongiorno,

La convalida degli stipendi di {{client_nom}} ({{echeance_libelle}}) è attesa entro il {{date_echeance}}. Vi preghiamo di verificare e convalidare gli elementi variabili (ore, premi, assenze) affinché l'elaborazione possa essere avviata in tempo.

Cordiali saluti,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  -- ── Bouclement ──
  (NULL, 'bouclement', 'fr', 'Relance bouclement (FR)',
   $h$Rappel — bouclement annuel de {{client_nom}}$h$,
   $h$Bonjour,

Dans le cadre du bouclement annuel de {{client_nom}} ({{echeance_libelle}}, échéance au {{date_echeance}}), il nous manque encore certaines pièces. Merci de nous les faire parvenir afin de respecter le calendrier de clôture.

Meilleures salutations,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'bouclement', 'de', 'Abschluss-Erinnerung (DE)',
   $h$Erinnerung — Jahresabschluss von {{client_nom}}$h$,
   $h$Guten Tag,

Im Rahmen des Jahresabschlusses von {{client_nom}} ({{echeance_libelle}}, Frist am {{date_echeance}}) fehlen uns noch einige Unterlagen. Bitte lassen Sie uns diese zukommen, damit wir den Abschlusszeitplan einhalten können.

Freundliche Grüsse,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'bouclement', 'it', 'Promemoria chiusura (IT)',
   $h$Promemoria — chiusura annuale di {{client_nom}}$h$,
   $h$Buongiorno,

Nell'ambito della chiusura annuale di {{client_nom}} ({{echeance_libelle}}, scadenza al {{date_echeance}}), ci mancano ancora alcuni documenti. Vi preghiamo di farceli pervenire per rispettare il calendario di chiusura.

Cordiali saluti,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  -- ── Relance documents ──
  (NULL, 'relance_documents', 'fr', 'Relance documents (FR)',
   $h$Rappel — documents manquants pour {{client_nom}}$h$,
   $h$Bonjour,

Sauf erreur de notre part, certains documents nécessaires au traitement de votre dossier ({{echeance_libelle}}) ne nous sont pas encore parvenus. Échéance : {{date_echeance}}. Merci de nous les transmettre dès que possible.

Meilleures salutations,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'relance_documents', 'de', 'Dokumente-Erinnerung (DE)',
   $h$Erinnerung — fehlende Unterlagen für {{client_nom}}$h$,
   $h$Guten Tag,

Wie es scheint, sind einige für die Bearbeitung Ihres Dossiers ({{echeance_libelle}}) erforderliche Unterlagen noch nicht bei uns eingegangen. Frist: {{date_echeance}}. Bitte senden Sie sie uns so bald wie möglich.

Freundliche Grüsse,
{{responsable_nom}}
{{cabinet_nom}}$h$),
  (NULL, 'relance_documents', 'it', 'Promemoria documenti (IT)',
   $h$Promemoria — documenti mancanti per {{client_nom}}$h$,
   $h$Buongiorno,

Salvo errori da parte nostra, alcuni documenti necessari al trattamento della vostra pratica ({{echeance_libelle}}) non ci sono ancora pervenuti. Scadenza: {{date_echeance}}. Vi preghiamo di trasmetterceli al più presto.

Cordiali saluti,
{{responsable_nom}}
{{cabinet_nom}}$h$);
