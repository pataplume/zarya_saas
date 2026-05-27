CREATE SCHEMA "crm";
--> statement-breakpoint
CREATE TYPE "crm"."cabinet_statut" AS ENUM('actif', 'suspendu', 'archive');--> statement-breakpoint
CREATE TYPE "crm"."plan_tarifaire" AS ENUM('starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "crm"."role_membre" AS ENUM('responsable', 'gestionnaire_salaires', 'collaborateur', 'lecteur');--> statement-breakpoint
CREATE TABLE "crm"."cabinet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raison_sociale" text NOT NULL,
	"ide" text,
	"email_contact" text,
	"statut" "crm"."cabinet_statut" DEFAULT 'actif' NOT NULL,
	"plan_tarifaire" "crm"."plan_tarifaire" DEFAULT 'starter' NOT NULL,
	"onboarding_termine" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm"."cabinet_membre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabinet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "crm"."role_membre" NOT NULL,
	"prenom" text,
	"nom" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "uniq_user_cabinet" UNIQUE("user_id","cabinet_id")
);
--> statement-breakpoint
ALTER TABLE "crm"."cabinet_membre" ADD CONSTRAINT "cabinet_membre_cabinet_id_cabinet_id_fk" FOREIGN KEY ("cabinet_id") REFERENCES "crm"."cabinet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cabinet_statut" ON "crm"."cabinet" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "idx_cabinet_membre_cabinet" ON "crm"."cabinet_membre" USING btree ("cabinet_id");--> statement-breakpoint
CREATE INDEX "idx_cabinet_membre_user" ON "crm"."cabinet_membre" USING btree ("user_id");