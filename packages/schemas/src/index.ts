// @zarya/schemas — Phase 1 : schémas Zod partagés (validation inputs/outputs cross-packages)

export type {
  CreateBanqueInput,
  UpdateBanqueInput,
  UpsertAccesLogicielInput,
  UpsertRelationInput,
} from "./bancaire";
export {
  createBanqueSchema,
  honorairesModeleSchema,
  ibanSchema,
  supprimerBanqueSchema,
  updateBanqueSchema,
  upsertAccesLogicielSchema,
  upsertRelationSchema,
  usageBanqueSchema,
} from "./bancaire";
export type {
  CreateAdresseInput,
  CreateClientAvecZefixInput,
  CreateClientInput,
  CreateContactInput,
  UpdateAdresseInput,
  UpdateClientInput,
  UpdateContactInput,
} from "./client";
export {
  clientTypeSchema,
  createAdresseSchema,
  createClientAvecZefixSchema,
  createClientSchema,
  createContactSchema,
  langueClientSchema,
  statutClientSchema,
  supprimerAdresseSchema,
  supprimerContactSchema,
  typeAdresseSchema,
  updateAdresseSchema,
  updateClientSchema,
  updateContactSchema,
} from "./client";
export { ideSchema } from "./common";
export type {
  CibleRelanceInput,
  CreateDocumentAttenduInput,
  UpdateDocumentAttenduInput,
} from "./documents-attendus";
export {
  categorieDocAttenduSchema,
  cibleRelanceSchema,
  createDocumentAttenduSchema,
  frequenceDocSchema,
  supprimerDocumentAttenduSchema,
  updateDocumentAttenduSchema,
} from "./documents-attendus";
export type {
  CreateServiceInput,
  UpdateServiceInput,
  UpsertParamComptableInput,
  UpsertSalaireConfigInput,
} from "./services";
export {
  createServiceSchema,
  frequencePaieSchema,
  frequenceServiceSchema,
  logicielComptableSchema,
  modeTransmissionSchema,
  regimeTvaSchema,
  supprimerServiceSchema,
  typeServiceSchema,
  updateServiceSchema,
  upsertParamComptableSchema,
  upsertSalaireConfigSchema,
} from "./services";
