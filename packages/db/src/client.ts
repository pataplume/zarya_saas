import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Client Drizzle — connexion directe (service role, bypasse RLS)
// Usage : migrations, background jobs, scripts admin
// Ne JAMAIS utiliser pour des queries app sans cabinet_id explicite
const queryClient = postgres(process.env.DATABASE_URL!);

export const db = drizzle(queryClient, { schema });

// ─── Multi-tenant helper ──────────────────────────────────────────────────────
// Toutes les queries applicatives DOIVENT passer par ce helper.
// Phase 1 : cabinet_id est passé explicitement dans chaque WHERE.
// Phase 2 : propagation JWT via SET LOCAL pour RLS natif Supabase.
export function getDbForCabinet(cabinet_id: string) {
  return { db, cabinet_id };
}

export type DbForCabinet = ReturnType<typeof getDbForCabinet>;
