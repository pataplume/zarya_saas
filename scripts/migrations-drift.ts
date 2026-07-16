// biome-ignore-all lint/suspicious/noConsole: script CLI de diagnostic, la sortie console est le livrable
/**
 * Diagnostic LECTURE SEULE du drift de migrations (ADR 0026).
 *
 * Compare les fichiers SQL locaux (`packages/db/migrations/*.sql`) avec l'historique
 * remote `supabase_migrations.schema_migrations`, et imprime :
 *   - les fichiers locaux sans trace dans l'historique (⚠️ absence ≠ non appliqué) ;
 *   - les entrées de l'historique sans fichier local ;
 *   - les correspondances approximatives (noms divergents à l'application).
 *
 * Garanties :
 *   - AUCUNE écriture : connexion unique enveloppée dans une transaction READ ONLY,
 *     uniquement des SELECT.
 *   - Lancé À LA MAIN, jamais en CI.
 *
 * Usage (depuis la racine du repo) :
 *   node scripts/migrations-drift.ts            # Node >= 23.6 (type stripping natif)
 *   pnpm dlx tsx scripts/migrations-drift.ts    # sinon
 *
 * Env : TEST_DATABASE_URL (prioritaire) ou DATABASE_URL. `.env.local` est chargé si présent.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "packages", "db", "migrations");

/** Retire un éventuel préfixe numérique (`0042_`, `0046b_`, …) pour comparer les noms. */
function normalize(name: string): string {
  return name.replace(/^\d+[a-z]?_/, "");
}

function listLocalMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.replace(/\.sql$/, ""))
    .sort();
}

interface RemoteMigration {
  version: string;
  name: string;
}

interface FuzzyMatch {
  local: string;
  remote: RemoteMigration;
}

interface DriftReport {
  matchedExact: number;
  matchedFuzzy: FuzzyMatch[];
  localOnly: string[];
  remoteOnly: RemoteMigration[];
}

/**
 * Apparie fichiers locaux et entrées remote en 3 passes (chaque élément consommé une seule fois) :
 *   1. nom identique (`0030_facture_schema` === `0030_facture_schema`) ;
 *   2. nom identique une fois le préfixe numérique retiré (`0005_calendar_echeance_relance`
 *      ↔ `calendar_echeance_relance`) ;
 *   3. heuristique : un nom normalisé préfixe de l'autre (`crm_vues_fonctions`
 *      ↔ `crm_vues_fonctions_a10`) — signalé comme correspondance approximative.
 */
function computeDrift(localStems: string[], remote: RemoteMigration[]): DriftReport {
  const remainingLocal = new Set(localStems);
  const remainingRemote = new Set(remote);
  let matchedExact = 0;
  const matchedFuzzy: FuzzyMatch[] = [];

  // Passe 1 — égalité stricte.
  for (const entry of [...remainingRemote]) {
    if (remainingLocal.has(entry.name)) {
      remainingLocal.delete(entry.name);
      remainingRemote.delete(entry);
      matchedExact++;
    }
  }

  // Passe 2 — égalité des noms normalisés.
  for (const entry of [...remainingRemote]) {
    const found = [...remainingLocal].find((stem) => normalize(stem) === normalize(entry.name));
    if (found !== undefined) {
      remainingLocal.delete(found);
      remainingRemote.delete(entry);
      matchedFuzzy.push({ local: found, remote: entry });
    }
  }

  // Passe 3 — préfixe (heuristique, longueur minimale pour éviter les faux positifs).
  const MIN_PREFIX_LENGTH = 8;
  for (const entry of [...remainingRemote]) {
    const remoteNorm = normalize(entry.name);
    const found = [...remainingLocal].find((stem) => {
      const localNorm = normalize(stem);
      if (Math.min(localNorm.length, remoteNorm.length) < MIN_PREFIX_LENGTH) return false;
      return remoteNorm.startsWith(localNorm) || localNorm.startsWith(remoteNorm);
    });
    if (found !== undefined) {
      remainingLocal.delete(found);
      remainingRemote.delete(entry);
      matchedFuzzy.push({ local: found, remote: entry });
    }
  }

  return {
    matchedExact,
    matchedFuzzy,
    localOnly: [...remainingLocal].sort(),
    remoteOnly: [...remainingRemote].sort((a, b) => a.version.localeCompare(b.version)),
  };
}

async function fetchRemoteMigrations(databaseUrl: string): Promise<RemoteMigration[] | null> {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false, // compatible pooler (pgbouncer, port 6543)
    connection: { application_name: "zarya-migrations-drift" },
  });

  try {
    // Transaction READ ONLY : toute écriture accidentelle serait rejetée par Postgres.
    return await sql.begin("read only", async (tx) => {
      const tableExists = await tx`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
      `;
      if (tableExists.length === 0) return null;

      const rows = await tx`
        SELECT version, name
        FROM supabase_migrations.schema_migrations
        ORDER BY version
      `;
      return rows.map((row) => ({
        version: String(row.version),
        // `name` peut être NULL (migration appliquée sans nom) → on retombe sur la version.
        name: row.name === null || row.name === undefined ? String(row.version) : String(row.name),
      }));
    });
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  // Même convention que packages/db/drizzle.config.ts : .env.local à la racine du repo.
  const envFile = path.join(REPO_ROOT, ".env.local");
  if (existsSync(envFile)) {
    config({ path: envFile });
  }

  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    console.error("✗ Aucune URL de base disponible.");
    console.error("  Définir TEST_DATABASE_URL (prioritaire) ou DATABASE_URL, par exemple :");
    console.error("    TEST_DATABASE_URL=postgresql://... node scripts/migrations-drift.ts");
    console.error("  (`.env.local` à la racine du repo est chargé automatiquement s'il existe.)");
    process.exit(1);
  }

  const source = process.env.TEST_DATABASE_URL !== undefined ? "TEST_DATABASE_URL" : "DATABASE_URL";
  // On n'affiche jamais l'URL complète (credentials) — uniquement l'hôte ciblé.
  const target = new URL(databaseUrl);
  console.log(`Diagnostic de drift des migrations (LECTURE SEULE) — ADR 0026`);
  console.log(`  Fichiers locaux : ${path.relative(REPO_ROOT, MIGRATIONS_DIR)}/*.sql`);
  console.log(`  Base interrogée : ${target.host}${target.pathname} (via ${source})\n`);

  const localStems = listLocalMigrations();
  console.log(`— ${localStems.length} fichiers SQL locaux.`);

  let remote: RemoteMigration[] | null;
  try {
    remote = await fetchRemoteMigrations(databaseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Connexion/lecture impossible : ${message}`);
    process.exit(1);
  }

  if (remote === null) {
    console.log("— Historique remote : table supabase_migrations.schema_migrations ABSENTE.");
    console.log(
      "  (Base vierge ou jamais migrée via la CLI/MCP Supabase — aucun rapprochement possible.)",
    );
    return;
  }

  console.log(`— ${remote.length} entrées dans supabase_migrations.schema_migrations.\n`);

  const drift = computeDrift(localStems, remote);

  console.log(`Correspondances exactes : ${drift.matchedExact}`);

  if (drift.matchedFuzzy.length > 0) {
    console.log(
      `\nCorrespondances approximatives (nom divergent à l'application) : ${drift.matchedFuzzy.length}`,
    );
    for (const match of drift.matchedFuzzy) {
      console.log(
        `  ≈ ${match.local}.sql ↔ ${match.remote.name} (version ${match.remote.version})`,
      );
    }
  }

  if (drift.localOnly.length > 0) {
    console.log(
      `\nFichiers locaux SANS trace dans l'historique remote : ${drift.localOnly.length}`,
    );
    for (const stem of drift.localOnly) {
      console.log(`  ← ${stem}.sql`);
    }
    console.log(
      "  ⚠️ Absence de l'historique ≠ non appliqué : ces migrations ont pu être exécutées",
    );
    console.log(
      "     sans journalisation (execute_sql, SQL editor). Vérifier le schéma réel (db diff).",
    );
  }

  if (drift.remoteOnly.length > 0) {
    console.log(`\nEntrées remote SANS fichier local : ${drift.remoteOnly.length}`);
    for (const entry of drift.remoteOnly) {
      console.log(`  → ${entry.name} (version ${entry.version})`);
    }
    console.log("  ⚠️ SQL appliqué jamais reversé dans le repo — récupérable via la colonne");
    console.log("     supabase_migrations.schema_migrations.statements.");
  }

  if (
    drift.localOnly.length === 0 &&
    drift.remoteOnly.length === 0 &&
    drift.matchedFuzzy.length === 0
  ) {
    console.log("\n✓ Aucun drift : fichiers locaux et historique remote alignés.");
  } else {
    console.log(
      "\nRéconciliation : voir docs/architecture/decisions/0026-source-unique-migrations.md.",
    );
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ Erreur inattendue : ${message}`);
  process.exit(1);
});
