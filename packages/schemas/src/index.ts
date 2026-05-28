// @zarya/schemas — Phase 1 : schémas Zod partagés (validation inputs/outputs cross-packages)

export type { CreateClientInput, UpdateClientInput } from "./client";
export {
  createClientSchema,
  statutClientSchema,
  updateClientSchema,
} from "./client";
export { ideSchema } from "./common";
