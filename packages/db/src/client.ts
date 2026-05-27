import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Client Drizzle — connexion directe (service role, bypasse RLS)
// Usage : migrations, background jobs, scripts admin
// Ne JAMAIS utiliser pour des queries app sans cabinet_id explicite
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "[zarya/db] DATABASE_URL env var manquante.\n" +
      "Format attendu : postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres\n" +
      "Vérifier la variable dans Vercel (Settings → Environment Variables) ou dans .env.local.",
  );
}
const queryClient = postgres(databaseUrl);

export const db = drizzle(queryClient, { schema });

// ─── Multi-tenant helper ──────────────────────────────────────────────────────
// Toutes les queries applicatives DOIVENT passer par ce helper.
// Phase 1 : cabinet_id est passé explicitement dans chaque WHERE.
// Phase 2 : propagation JWT via SET LOCAL pour RLS natif Supabase.
export function getDbForCabinet(cabinet_id: string) {
  return { db, cabinet_id };
}

export type DbForCabinet = ReturnType<typeof getDbForCabinet>;
