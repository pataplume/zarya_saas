import { z } from "zod";

// Schémas par opération — Lot 5 (ADR 0025 §6) : sections bancaire / facturation /
// accès logiciel externe du dossier client. ⚠️ champs ULTRA-SENSIBLES (IBAN,
// credentials Open Banking, credentials logiciel comptable) → chiffrés au Vault par
// la server action (ADR 0013) ; le schéma valide le clair AVANT chiffrement, il n'est
// jamais persisté en clair. Enums alignés sur le schéma scellé (crm.ts) :
//   - usage_banque       : principal | secondaire | paie | tva
//   - honoraires_modele  : forfait | regie | mixte

// ─── IBAN : validation de format (le checksum mod-97 est revérifié côté action) ──────────────
// On accepte les espaces (normalisés ensuite). Borne ISO 13616 générale (15–34 alphanum).
export const ibanSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, "").toUpperCase())
  .refine((s) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s), "IBAN invalide (format ISO 13616)");

export const usageBanqueSchema = z.enum(["principal", "secondaire", "paie", "tva"]);
export const honorairesModeleSchema = z.enum(["forfait", "regie", "mixte"]);

// ─── crm.banque (un client peut avoir plusieurs comptes) ─────────────────────────────────────
export const createBanqueSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  nom_banque: z.string().trim().max(200).optional(),
  iban: ibanSchema,
  bic: z.string().trim().max(20).optional(),
  devise: z.string().trim().min(3).max(3).optional(),
  usage: usageBanqueSchema.optional(),
  // Secret Open Banking optionnel (chaîne libre / JSON sérialisé). Chiffré au Vault par l'action.
  credentials_open_banking: z.string().trim().min(1).max(10_000).optional(),
});

export const updateBanqueSchema = z.object({
  id: z.string().uuid("Compte invalide"),
  nom_banque: z.string().trim().max(200).optional(),
  // IBAN optionnel à la mise à jour : absent ⇒ inchangé (le secret Vault n'est pas régénéré).
  iban: ibanSchema.optional(),
  bic: z.string().trim().max(20).optional(),
  devise: z.string().trim().min(3).max(3).optional(),
  usage: usageBanqueSchema.optional(),
  actif: z.boolean().optional(),
  credentials_open_banking: z.string().trim().min(1).max(10_000).optional(),
});

export const supprimerBanqueSchema = z.object({
  id: z.string().uuid("Compte invalide"),
});

// ─── crm.relation : honoraires/pack (NON sensibles, en clair OK) + iban_facturation (Vault) ───
export const upsertRelationSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  pack_tarifaire: z.string().trim().max(200).optional(),
  honoraires_mensuels: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .refine(
      (v) => v === undefined || (Number.isFinite(v) && v >= 0),
      "Honoraires mensuels invalides",
    ),
  honoraires_modele: honorairesModeleSchema.optional(),
  date_signature: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
    .optional(),
  date_renouvellement: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
    .optional(),
  duree_engagement_mois: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
    .refine(
      (v) => v === undefined || (Number.isInteger(v) && v >= 0),
      "Durée d'engagement invalide",
    ),
  notes_facturation: z.string().trim().max(2000).optional(),
  // ⚠️ ULTRA-SENSIBLE : IBAN de facturation → chiffré au Vault par l'action (jamais en clair).
  iban_facturation: ibanSchema.optional(),
});

// ─── crm.param_comptable : credentials d'accès au logiciel comptable (Vault) ──────────────────
// Section séparée du Lot 2 (qui couvre logiciel/exercice/transmission, non sensibles) car le
// secret d'accès est ULTRA-SENSIBLE et ne doit transiter que par ce write-path chiffré.
export const upsertAccesLogicielSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  // Chaîne libre / JSON sérialisé des credentials. Chiffré au Vault par l'action.
  acces_logiciel_externe: z.string().trim().min(1, "Credentials requis").max(10_000),
});

export type CreateBanqueInput = z.infer<typeof createBanqueSchema>;
export type UpdateBanqueInput = z.infer<typeof updateBanqueSchema>;
export type UpsertRelationInput = z.infer<typeof upsertRelationSchema>;
export type UpsertAccesLogicielInput = z.infer<typeof upsertAccesLogicielSchema>;
