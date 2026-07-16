/**
 * Garde-fou base de tests (P0-2 — AUDIT-MVP.md § 8).
 *
 * Incident du 16.07.2026 : la `DATABASE_URL` de `.env.local` pointait la base de
 * PRODUCTION (ref projet xkwbtwikecihypjxundl) ; un `pnpm test` local a saturé ses
 * connexions Postgres (erreur 53300) et rendu les pages prod indisponibles ~2 min.
 * La base contient en outre ~929 cabinets, majoritairement des résidus de tests.
 *
 * Depuis, la suite de tests ne lit plus JAMAIS `DATABASE_URL` :
 *  - la SEULE source d'URL de base pour les tests est `TEST_DATABASE_URL` ;
 *  - absente → échec immédiat des tests d'intégration avec la marche à suivre ;
 *  - contenant la ref du projet de prod → échec immédiat, sans exception.
 *
 * Fonctions PURES (aucune connexion, aucun import) : testables en unitaire
 * (tests/unit/garde-fou-base-de-test.test.ts), consommées par tests/setup.ts
 * et tests/integration/helpers/rls.ts.
 */

/** Ref du projet Supabase de PRODUCTION — toute URL de test la contenant est refusée. */
export const REF_PROJET_PROD = "xkwbtwikecihypjxundl";

export const MESSAGE_TEST_DATABASE_URL_MANQUANTE = [
  "[tests] TEST_DATABASE_URL manquante — les tests d'intégration ne peuvent pas tourner.",
  "",
  "Les tests ne lisent plus JAMAIS DATABASE_URL (incident du 16.07.2026 : la suite lancée",
  "contre la base de PRODUCTION a saturé ses connexions Postgres et fait tomber la prod).",
  "Pour provisionner une base de test :",
  "  1. Créer un projet (ou une branche) Supabase DÉDIÉ aux tests — jamais le projet de prod.",
  "  2. Appliquer les migrations de packages/db/migrations/ sur cette base.",
  "  3. Poser dans .env.local :",
  "     TEST_DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@db.REF_PROJET_TEST.supabase.co:5432/postgres",
  "  4. En CI : poser le secret GitHub Actions TEST_DATABASE_URL.",
  "Voir docs/architecture/dev-environment.md § « Base de tests ».",
].join("\n");

export const MESSAGE_TEST_DATABASE_URL_PROD = [
  `[tests] TEST_DATABASE_URL pointe sur la PROD (ref projet ${REF_PROJET_PROD}) — arrêt immédiat.`,
  "Les tests ne doivent JAMAIS toucher la base de production : pointer TEST_DATABASE_URL vers",
  "un projet ou une branche Supabase dédié aux tests.",
  "Voir docs/architecture/dev-environment.md § « Base de tests ».",
].join("\n");

/**
 * URL factice syntaxiquement valide mais inconnectable (port 1, refus immédiat).
 * Sert de `DATABASE_URL` de substitution pour les runs unitaires sans TEST_DATABASE_URL :
 * `@zarya/db` fait `new URL()` au chargement du module, mais un test unitaire pur
 * n'ouvre jamais de connexion.
 */
export const URL_FACTICE_TESTS_UNITAIRES =
  "postgresql://tests_unitaires:aucune_connexion@localhost:1/zarya_tests_sans_base";

/**
 * Résout l'URL de la base de TEST depuis l'environnement.
 *
 * Lit EXCLUSIVEMENT `TEST_DATABASE_URL` (jamais `DATABASE_URL`). Jette une erreur
 * explicite (en français, avec la marche à suivre) si la variable est absente/vide,
 * ou si elle contient la ref du projet Supabase de production.
 */
export function resoudreUrlBaseDeTest(env: Readonly<Record<string, string | undefined>>): string {
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(MESSAGE_TEST_DATABASE_URL_MANQUANTE);
  }
  if (url.includes(REF_PROJET_PROD)) {
    throw new Error(MESSAGE_TEST_DATABASE_URL_PROD);
  }
  return url;
}

/** Vrai si le fichier appartient à la suite d'intégration (`tests/integration/**`). */
export function estCheminTestIntegration(cheminFichier: string): boolean {
  return cheminFichier.replaceAll("\\", "/").includes("/tests/integration/");
}
