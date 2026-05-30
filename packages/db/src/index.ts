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
  canalRelanceEnum,
  categorieDocumentEnum,
  client,
  crmSchema,
  docSchema,
  document,
  echeance,
  extractionContextEnum,
  extractionInputTypeEnum,
  extractionSchema,
  extractionStatusEnum,
  fichierPhysique,
  invitationMembre,
  invocation,
  planTarifaireEnum,
  propositionClassement,
  relance,
  roleMembreEnum,
  sessionOnboardingFiduciaire,
  sourceIngestionEnum,
  statutClassementEnum,
  statutClientEnum,
  statutEcheanceEnum,
  statutInvitationMembreEnum,
  statutRelanceEnum,
  statutSessionOnboardingFiduciaireEnum,
  statutTraitementEnum,
  typeEcheanceEnum,
  uploadBrut,
  zefixRechercheCabinet,
} from "./schema";
