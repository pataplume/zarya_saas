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
// Défaut :
//  - sur Vercel (process.env.VERCEL posé par la plateforme) : 1 — chaque instance serverless
//    traite une requête à la fois ; avec le défaut historique 10, N instances concurrentes
//    ouvrent jusqu'à 10×N connexions et saturent le plafond ~60 de Supabase (erreur 53300
//    constatée en prod le 16.07.2026) ;
//  - ailleurs (dev local, scripts, workers longue durée) : 10 = défaut historique postgres-js.
// Surchargeable explicitement par env : DB_POOL_MAX (CI intégration : DB_POOL_MAX=3 +
// DB_IDLE_TIMEOUT=10, footprint minimal sur la base partagée).
const defaultPoolMax = process.env.VERCEL ? 1 : 10;
const poolMax = Number(process.env.DB_POOL_MAX ?? defaultPoolMax);
const idleTimeout = process.env.DB_IDLE_TIMEOUT ? Number(process.env.DB_IDLE_TIMEOUT) : undefined;
const queryClient = postgres(databaseUrl, {
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : defaultPoolMax,
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
