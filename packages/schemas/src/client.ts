import { z } from "zod";
import { ideSchema } from "./common";

// Schémas par opération pour crm.client (mini-CRM, Phase 3.5 ; étendus Lot 1 ADR 0025).
// Aligné sur packages/db schema crm.client + statutClientEnum.

export const statutClientSchema = z.enum(["prospect", "actif", "inactif", "archive"]);

// Enums alignés sur crm.ts (clientTypeEnum, langueClientEnum).
export const clientTypeSchema = z.enum(["pme", "independant", "prive", "association"]);
export const langueClientSchema = z.enum(["fr", "de", "it", "en"]);

export const createClientSchema = z.object({
  raison_sociale: z.string().min(1, "Raison sociale requise").max(200),
  ide: ideSchema.optional(),
  email_contact: z.string().email("Email invalide").optional(),
  statut: statutClientSchema.default("actif"),
});

// Lot 1 (ADR 0025) — édition de l'identité du client. Champs étendus, tous
// optionnels (édition section par section, non bloquante). AUCUN champ sensible.
// `tags` : liste de libellés courts ; `responsable_id` : membre du cabinet (vérifié
// côté action contre crm.cabinet_membre du même cabinet).
export const updateClientSchema = z.object({
  id: z.string().uuid("Identifiant client invalide"),
  raison_sociale: z.string().min(1, "Raison sociale requise").max(200).optional(),
  type: clientTypeSchema.optional(),
  ide: ideSchema.optional(),
  numero_tva: z.string().trim().max(20, "Numéro de TVA trop long").optional(),
  forme_juridique: z.string().trim().max(60, "Forme juridique trop longue").optional(),
  langue: langueClientSchema.optional(),
  responsable_id: z.string().uuid("Gestionnaire invalide").optional(),
  email_contact: z.string().email("Email invalide").optional(),
  statut: statutClientSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20, "Trop de tags").optional(),
  notes_commerciales: z.string().trim().max(5000, "Notes trop longues").optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// Lot 3 (ADR 0025) — création enrichie d'un client, avec préremplissage Zefix de l'identité
// ET de l'adresse du siège (corrige le bug ONB « Zefix ne remplit pas l'adresse »). Tous les
// champs au-delà de la raison sociale sont OPTIONNELS : parcours NON BLOQUANT (la saisie reste
// possible même sans aucune donnée Zefix). L'adresse n'est créée que si au moins rue OU ville
// est fournie. AUCUN champ sensible (IBAN/AVS/credentials).
export const createClientAvecZefixSchema = z.object({
  raison_sociale: z.string().trim().min(1, "Raison sociale requise").max(200),
  ide: ideSchema.optional(),
  type: clientTypeSchema.optional(),
  forme_juridique: z.string().trim().max(60, "Forme juridique trop longue").optional(),
  email_contact: z.string().email("Email invalide").optional(),
  statut: statutClientSchema.default("actif"),
  // Adresse du siège (préremplie depuis Zefix) — entièrement optionnelle.
  adresse_rue: z.string().trim().max(160).optional(),
  adresse_code_postal: z.string().trim().max(16).optional(),
  adresse_ville: z.string().trim().max(120).optional(),
  adresse_canton: z.string().trim().max(2).optional(),
  adresse_pays: z.string().trim().length(2, "Code pays sur 2 lettres").optional(),
});

export type CreateClientAvecZefixInput = z.infer<typeof createClientAvecZefixSchema>;

// ─── crm.contact (Lot 1, ADR 0025) ──────────────────────────────────────────
// Interlocuteurs d'un client. `nom` requis (NOT NULL en DB) ; reste optionnel.

const contactCommon = {
  prenom: z.string().trim().max(80).optional(),
  role: z.string().trim().max(80).optional(),
  est_principal: z.boolean().optional(),
  est_contact_rh: z.boolean().optional(),
  est_signataire: z.boolean().optional(),
  email: z.string().email("Email invalide").optional(),
  telephone: z.string().trim().max(40).optional(),
};

export const createContactSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  nom: z.string().trim().min(1, "Nom requis").max(120),
  ...contactCommon,
});

export const updateContactSchema = z.object({
  id: z.string().uuid("Contact invalide"),
  nom: z.string().trim().min(1, "Nom requis").max(120).optional(),
  ...contactCommon,
});

export const supprimerContactSchema = z.object({
  id: z.string().uuid("Contact invalide"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// ─── crm.adresse (Lot 1, ADR 0025) ──────────────────────────────────────────

export const typeAdresseSchema = z.enum(["postale", "facturation", "siege"]);

const adresseCommon = {
  rue: z.string().trim().max(160).optional(),
  complement: z.string().trim().max(160).optional(),
  code_postal: z.string().trim().max(16).optional(),
  ville: z.string().trim().max(120).optional(),
  canton: z.string().trim().max(2).optional(), // code canton suisse (VD, GE…)
  pays: z.string().trim().length(2, "Code pays sur 2 lettres").optional(), // ISO 3166-1 alpha-2
  est_principale: z.boolean().optional(),
};

export const createAdresseSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  type: typeAdresseSchema,
  ...adresseCommon,
});

export const updateAdresseSchema = z.object({
  id: z.string().uuid("Adresse invalide"),
  type: typeAdresseSchema.optional(),
  ...adresseCommon,
});

export const supprimerAdresseSchema = z.object({
  id: z.string().uuid("Adresse invalide"),
});

export type CreateAdresseInput = z.infer<typeof createAdresseSchema>;
export type UpdateAdresseInput = z.infer<typeof updateAdresseSchema>;
