import { z } from "zod";

// Identifiant des entreprises suisses (IDE / UID) — format CHE-XXX.XXX.XXX.
// Cf. /docs/data-model/crm-schema.md et packages/db schema crm.client.
export const ideSchema = z
  .string()
  .regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/, "IDE invalide (format attendu : CHE-123.456.789)");
