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
// Taille du pool de connexions, bornée pour cohabiter avec une base Postgres à faible
// `max_connections` (Supabase Pro = 60, dont 3 réservées superuser → ~57 utilisables, partagées
// avec PostgREST/GoTrue/pg_cron + tous les déploiements Vercel). Sans borne, postgres-js ouvre
// jusqu'à 10 connexions PAR instance serverless/worker → saturation (`53300`) sous charge.
// Défaut 10 = défaut historique postgres-js (prod inchangée). Surchargeable par env :
//  - Vercel serverless : DB_POOL_MAX=1 recommandé (1 requête par instance) ;
//  - CI intégration : DB_POOL_MAX=3 + DB_IDLE_TIMEOUT=10 (footprint minimal sur la base partagée).
const poolMax = Number(process.env.DB_POOL_MAX ?? 10);
const idleTimeout = process.env.DB_IDLE_TIMEOUT ? Number(process.env.DB_IDLE_TIMEOUT) : undefined;
const queryClient = postgres(databaseUrl, {
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
  ...(idleTimeout && idleTimeout > 0 ? { idle_timeout: idleTimeout } : {}),
});

export const db = drizzle(queryClient, { schema });

// ─── Multi-tenant helper ──────────────────────────────────────────────────────
// Toutes les queries applicatives DOIVENT passer par ce helper.
// Phase 1 : cabinet_id est passé explicitement dans chaque WHERE.
// Phase 2 : propagation JWT via SET LOCAL pour RLS natif Supabase.
export function getDbForCabinet(cabinet_id: string) {
  return { db, cabinet_id };
}

export type DbForCabinet = ReturnType<typeof getDbForCabinet>;
