CREATE TYPE "crm"."statut_invitation_membre" AS ENUM('envoyee', 'lue', 'acceptee', 'expiree', 'refusee', 'annulee');--> statement-breakpoint
CREATE TYPE "crm"."statut_session_onboarding_fiduciaire" AS ENUM('inscrit', 'email_verifie', 'etape_a_en_cours', 'etape_a_terminee', 'etape_b_en_cours', 'etape_b_terminee', 'etape_c_en_cours', 'etape_c_terminee', 'etape_d_en_cours', 'etape_d_terminee', 'etape_e_en_cours', 'etape_e_terminee', 'etape_f_en_cours', 'etape_f_terminee', 'etape_f_differee', 'paiement_configure', 'actif', 'abandonne', 'suspendu', 'archive');--> statement-breakpoint
CREATE TABLE "crm"."invitation_membre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabinet_id" uuid NOT NULL,
	"session_id" uuid,
	"email" text NOT NULL,
	"prenom" text,
	"nom" text,
	"role_propose" "crm"."role_membre" NOT NULL,
	"specialisation" text[],
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"token_expire_at" timestamp with time zone NOT NULL,
	"statut" "crm"."statut_invitation_membre" DEFAULT 'envoyee' NOT NULL,
	"date_envoi" timestamp with time zone DEFAULT now() NOT NULL,
	"date_lecture" timestamp with time zone,
	"date_acceptation" timestamp with time zone,
	"date_refus" timestamp with time zone,
	"envoyee_par" uuid,
	"cabinet_membre_id" uuid,
	"relance_count" text DEFAULT '0',
	"derniere_relance_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_membre_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "crm"."session_onboarding_fiduciaire" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabinet_id" uuid NOT NULL,
	"statut" "crm"."statut_session_onboarding_fiduciaire" DEFAULT 'inscrit' NOT NULL,
	"date_inscription" timestamp with time zone DEFAULT now() NOT NULL,
	"date_verification_email" timestamp with time zone,
	"date_derniere_activite" timestamp with time zone DEFAULT now() NOT NULL,
	"date_completion" timestamp with time zone,
	"etape_a_terminee_at" timestamp with time zone,
	"etape_b_terminee_at" timestamp with time zone,
	"etape_c_terminee_at" timestamp with time zone,
	"etape_d_terminee_at" timestamp with time zone,
	"etape_e_terminee_at" timestamp with time zone,
	"etape_f_terminee_at" timestamp with time zone,
	"etape_f_differee_at" timestamp with time zone,
	"consentement_cgu" boolean DEFAULT false NOT NULL,
	"consentement_cgu_at" timestamp with time zone,
	"consentement_zefix" boolean DEFAULT false,
	"consentement_zefix_at" timestamp with time zone,
	"plan_choisi" "crm"."plan_tarifaire",
	"paiement_configure" boolean DEFAULT false,
	"paiement_configure_at" timestamp with time zone,
	"date_fin_essai" timestamp with time zone,
	"code_parrainage_utilise" text,
	"utm_source" text,
	"utm_campaign" text,
	"utm_medium" text,
	"notes_csm" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_onboarding_fiduciaire_cabinet_id_unique" UNIQUE("cabinet_id")
);
--> statement-breakpoint
CREATE TABLE "crm"."zefix_recherche_cabinet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"cabinet_id" uuid,
	"requete" text NOT NULL,
	"nb_resultats" text,
	"ide_selectionne" text,
	"reponse_brute" text,
	"consentement_donne" boolean NOT NULL,
	"date_appel" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "onboarding_termine_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "zefix_ehraid" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "forme_juridique" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "adresse_rue" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "adresse_npa" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "adresse_ville" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "adresse_canton" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "date_inscription_rc" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "capital_social" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "capital_devise" text DEFAULT 'CHF';--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "but_statutaire" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "tva_numero" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "langues_operationnelles" text[];--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "langue_principale" text DEFAULT 'fr';--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "fuseau_horaire" text DEFAULT 'Europe/Zurich' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "devise" text DEFAULT 'CHF' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "site_web" text;--> statement-breakpoint
ALTER TABLE "crm"."cabinet" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "crm"."invitation_membre" ADD CONSTRAINT "invitation_membre_cabinet_id_cabinet_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "crm"."cabinet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."invitation_membre" ADD CONSTRAINT "invitation_membre_session_id_session_onboarding_fiduciaire_id_fk" FOREIGN KEY ("session_id") REFERENCES "crm"."session_onboarding_fiduciaire"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."invitation_membre" ADD CONSTRAINT "invitation_membre_cabinet_membre_id_cabinet_membre_id_fk" FOREIGN KEY ("cabinet_membre_id") REFERENCES "crm"."cabinet_membre"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."session_onboarding_fiduciaire" ADD CONSTRAINT "session_onboarding_fiduciaire_cabinet_id_cabinet_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "crm"."cabinet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."zefix_recherche_cabinet" ADD CONSTRAINT "zefix_recherche_cabinet_session_id_session_onboarding_fiduciaire_id_fk" FOREIGN KEY ("session_id") REFERENCES "crm"."session_onboarding_fiduciaire"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."zefix_recherche_cabinet" ADD CONSTRAINT "zefix_recherche_cabinet_cabinet_id_cabinet_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "crm"."cabinet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invitation_membre_cabinet" ON "crm"."invitation_membre" USING btree ("cabinet_id","statut");--> statement-breakpoint
CREATE INDEX "idx_invitation_membre_email" ON "crm"."invitation_membre" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitation_membre_token" ON "crm"."invitation_membre" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_session_onboarding_statut" ON "crm"."session_onboarding_fiduciaire" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_session_onboarding_activite" ON "crm"."session_onboarding_fiduciaire" USING btree ("statut","date_derniere_activite");--> statement-breakpoint
CREATE INDEX "idx_zefix_recherche_cabinet" ON "crm"."zefix_recherche_cabinet" USING btree ("cabinet_id");--> statement-breakpoint
CREATE INDEX "idx_zefix_recherche_session" ON "crm"."zefix_recherche_cabinet" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_cabinet_created_by" ON "crm"."cabinet" USING btree ("created_by");