import { z } from "zod";

// Schémas par opération — Lot 2 (ADR 0025) : services, paramétrage comptable et config
// salaire d'un client. Alignés sur les enums RÉELS du schéma scellé (crm.ts) :
//   - type_service        : comptabilite | fiscalite | salaires | tva | bouclement | conseil
//   - frequence_service   : mensuelle | trimestrielle | semestrielle | annuelle | ponctuelle
//   - logiciel_comptable  : bexio | abacus | cresus | winbiz | banana | excel | officemaker | autre
//   - mode_transmission   : email | nas_partage | connecteur_logiciel | physique
//   - frequence_paie      : mensuelle | quinzomadaire | hebdomadaire
// AUCUN champ ultra-sensible (acces_logiciel_externe réservé Lot 5 / Vault).

// ─── crm.service ─────────────────────────────────────────────────────────────

export const typeServiceSchema = z.enum([
  "comptabilite",
  "fiscalite",
  "salaires",
  "tva",
  "bouclement",
  "conseil",
]);

export const frequenceServiceSchema = z.enum([
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
]);

// Régime TVA porté par service.parametres->>'regime_tva' (point d'extension documenté,
// cf. fn_generer_echeances / addendum ADR 0011 §10). Valeurs alignées sur le seed fédéral.
export const regimeTvaSchema = z.enum([
  "effective_trimestre",
  "effective_semestre",
  "forfaitaire_semestre",
  "forfaitaire_annuel",
  "mensuel",
]);

const serviceCommon = {
  frequence: frequenceServiceSchema.optional(),
  regime_tva: regimeTvaSchema.optional(),
  notes: z.string().trim().max(2000, "Notes trop longues").optional(),
};

export const createServiceSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  type: typeServiceSchema,
  actif: z.boolean().optional(),
  ...serviceCommon,
});

export const updateServiceSchema = z.object({
  id: z.string().uuid("Service invalide"),
  actif: z.boolean().optional(),
  ...serviceCommon,
});

export const supprimerServiceSchema = z.object({
  id: z.string().uuid("Service invalide"),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ─── crm.param_comptable (1-1 client) ────────────────────────────────────────

export const logicielComptableSchema = z.enum([
  "bexio",
  "abacus",
  "cresus",
  "winbiz",
  "banana",
  "excel",
  "officemaker",
  "autre",
]);

export const modeTransmissionSchema = z.enum([
  "email",
  "nas_partage",
  "connecteur_logiciel",
  "physique",
]);

// Upsert (la ligne est 1-1 avec le client, client_id = PK). Tous champs optionnels :
// édition section par section, non bloquante. `acces_logiciel_externe` EXCLU (Lot 5/Vault).
export const upsertParamComptableSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  logiciel: logicielComptableSchema.optional(),
  logiciel_autre: z.string().trim().max(80).optional(),
  plan_comptable: z.string().trim().max(120).optional(),
  // Dates ISO `YYYY-MM-DD` (validation de format ; cohérence métier hors périmètre).
  date_debut_exercice: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
    .optional(),
  date_bouclement: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
    .optional(),
  mode_transmission: modeTransmissionSchema.optional(),
});

export type UpsertParamComptableInput = z.infer<typeof upsertParamComptableSchema>;

// ─── crm.salaire_config (1-1 client) ─────────────────────────────────────────

export const frequencePaieSchema = z.enum(["mensuelle", "quinzomadaire", "hebdomadaire"]);

export const upsertSalaireConfigSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  frequence_paie: frequencePaieSchema.optional(),
  // Jour du mois (1-31) où la validation des salaires est attendue.
  date_validation_jour_du_mois: z
    .number()
    .int()
    .min(1, "Jour entre 1 et 31")
    .max(31, "Jour entre 1 et 31")
    .optional(),
});

export type UpsertSalaireConfigInput = z.infer<typeof upsertSalaireConfigSchema>;
