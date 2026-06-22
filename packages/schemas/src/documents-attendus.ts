import { z } from "zod";

// Schémas par opération — Lot 4 (ADR 0025) : documents attendus (crm.document_attendu)
// + déclenchement manuel d'une relance (crm.relance, Mode A). Alignés sur les enums RÉELS
// du schéma scellé (crm.ts) :
//   - categorie_doc_attendu : bancaire | fiscal | salaire | commercial | administratif
//   - frequence_service     : mensuelle | trimestrielle | semestrielle | annuelle | ponctuelle
//   - type_echeance         : fiscale | tva | bouclement | salaire | relance_documents | personnalisee
// AUCUN champ ultra-sensible (Lot 5 / Vault).

// ─── crm.document_attendu ─────────────────────────────────────────────────────

export const categorieDocAttenduSchema = z.enum([
  "bancaire",
  "fiscal",
  "salaire",
  "commercial",
  "administratif",
]);

// `document_attendu.frequence` réutilise l'enum frequence_service (valeurs identiques).
export const frequenceDocSchema = z.enum([
  "mensuelle",
  "trimestrielle",
  "semestrielle",
  "annuelle",
  "ponctuelle",
]);

export const createDocumentAttenduSchema = z.object({
  client_id: z.string().uuid("Client invalide"),
  // Service rattaché (facultatif) — un document peut être transverse au client.
  service_id: z.string().uuid("Service invalide").optional(),
  type_document: z.string().trim().min(1, "Libellé requis").max(160, "Libellé trop long"),
  categorie: categorieDocAttenduSchema.optional(),
  frequence: frequenceDocSchema,
  obligatoire: z.boolean().optional(),
  // Délai (jours) après la fin de période pour réclamer le document.
  deadline_jours_apres_periode: z
    .number()
    .int("Nombre de jours entier")
    .min(0, "Délai positif")
    .max(366, "Délai trop long")
    .optional(),
});

export const updateDocumentAttenduSchema = z.object({
  id: z.string().uuid("Document invalide"),
  service_id: z.string().uuid("Service invalide").nullable().optional(),
  type_document: z
    .string()
    .trim()
    .min(1, "Libellé requis")
    .max(160, "Libellé trop long")
    .optional(),
  categorie: categorieDocAttenduSchema.nullable().optional(),
  frequence: frequenceDocSchema.optional(),
  obligatoire: z.boolean().optional(),
  deadline_jours_apres_periode: z
    .number()
    .int("Nombre de jours entier")
    .min(0, "Délai positif")
    .max(366, "Délai trop long")
    .nullable()
    .optional(),
});

export const supprimerDocumentAttenduSchema = z.object({
  id: z.string().uuid("Document invalide"),
});

export type CreateDocumentAttenduInput = z.infer<typeof createDocumentAttenduSchema>;
export type UpdateDocumentAttenduInput = z.infer<typeof updateDocumentAttenduSchema>;

// ─── crm.relance — déclenchement manuel (bouton « Relancer ») ─────────────────
// La cible est polymorphe (échéance / document / client). Mode A : crée un BROUILLON,
// jamais d'envoi (l'envoi a sa propre action, après confirmation humaine).

export const cibleRelanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("echeance"), echeanceId: z.string().uuid("Échéance invalide") }),
  z.object({
    kind: z.literal("document"),
    documentAttenduId: z.string().uuid("Document invalide"),
  }),
  z.object({ kind: z.literal("client"), clientId: z.string().uuid("Client invalide") }),
]);

export type CibleRelanceInput = z.infer<typeof cibleRelanceSchema>;
