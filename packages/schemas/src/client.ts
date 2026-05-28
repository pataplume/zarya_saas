import { z } from "zod";
import { ideSchema } from "./common";

// Schémas par opération pour crm.client (mini-CRM, Phase 3.5).
// Périmètre volontairement minimal : raison sociale, IDE, email, statut.
// Aligné sur packages/db schema crm.client + statutClientEnum.

export const statutClientSchema = z.enum(["prospect", "actif", "inactif", "archive"]);

export const createClientSchema = z.object({
  raison_sociale: z.string().min(1, "Raison sociale requise").max(200),
  ide: ideSchema.optional(),
  email_contact: z.string().email("Email invalide").optional(),
  statut: statutClientSchema.default("actif"),
});

export const updateClientSchema = createClientSchema.partial().extend({
  id: z.string().uuid("Identifiant client invalide"),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
