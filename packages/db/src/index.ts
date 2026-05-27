// @zarya/db — Schémas Drizzle ORM, client DB, migrations

export type { DbForCabinet } from "./client";
export { db, getDbForCabinet } from "./client";

// Schémas et enums
export {
  cabinet,
  cabinetMembre,
  cabinetStatutEnum,
  crmSchema,
  planTarifaireEnum,
  roleMembreEnum,
} from "./schema";
