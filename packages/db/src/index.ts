// @zarya/db — Schémas Drizzle ORM, client DB, migrations

// Opérateurs de requête drizzle ré-exportés (le package db possède l'ORM).
export { and, eq } from "drizzle-orm";
export type { DbForCabinet } from "./client";
export { db, getDbForCabinet } from "./client";
// Schémas et enums
export {
  cabinet,
  cabinetMembre,
  cabinetStatutEnum,
  categorieDocumentEnum,
  client,
  crmSchema,
  docSchema,
  document,
  extractionContextEnum,
  extractionInputTypeEnum,
  extractionSchema,
  extractionStatusEnum,
  fichierPhysique,
  invitationMembre,
  invocation,
  planTarifaireEnum,
  propositionClassement,
  roleMembreEnum,
  sessionOnboardingFiduciaire,
  sourceIngestionEnum,
  statutClassementEnum,
  statutClientEnum,
  statutInvitationMembreEnum,
  statutSessionOnboardingFiduciaireEnum,
  statutTraitementEnum,
  uploadBrut,
  zefixRechercheCabinet,
} from "./schema";
