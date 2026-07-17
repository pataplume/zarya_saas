/**
 * Résolution de la base de tests (P0-2 amendé — décision founder du 17.07.2026).
 *
 * Incident du 16.07.2026 : la `DATABASE_URL` de `.env.local` pointait la base de
 * PRODUCTION (ref projet xkwbtwikecihypjxundl) ; un `pnpm test` local a saturé ses
 * connexions Postgres (erreur 53300) et rendu les pages prod indisponibles ~2 min.
 *
 * Décision founder du 17.07.2026 : PAS de base de test dédiée avant le lancement
 * (ni le temps ni le budget). Les tests d'intégration tournent donc contre la base
 * LIVE, en connaissance de cause, mais avec des brides automatiques anti-53300 :
 *
 *  - `TEST_DATABASE_URL` posée (base dédiée) → mode « dediee », plein régime.
 *    C'est la porte opt-in pour l'après-lancement.
 *  - Sinon → mode « live_bride » : repli sur `DATABASE_URL` (même la prod) avec
 *    (1) pool plafonné à DB_POOL_MAX=2 par process (tests/setup.ts, AVANT la création
 *    du client @zarya/db), (2) concurrence vitest réduite (vitest.config.ts), et
 *    (3) avertissement console explicite au démarrage du setup.
 *  - Aucune URL → mode « aucune_url » : les tests unitaires purs tournent (URL factice
 *    inconnectable substituée), les fichiers de tests/integration/ échouent
 *    immédiatement avec la marche à suivre.
 *
 * Fonctions PURES (aucune connexion, aucun import) : testables en unitaire
 * (tests/unit/garde-fou-base-de-test.test.ts), consommées par tests/setup.ts,
 * tests/integration/helpers/rls.ts et vitest.config.ts.
 */

/**
 * Ref du projet Supabase de PRODUCTION. Une `TEST_DATABASE_URL` la contenant n'est PAS
 * une base dédiée : elle est traitée en mode live bridé (jamais plein régime sur la prod).
 */
export const REF_PROJET_PROD = "xkwbtwikecihypjxundl";

/** Plafond de pool forcé par process en mode live bridé (valeur de DB_POOL_MAX). */
export const POOL_MAX_MODE_LIVE_BRIDE = "2";

/** Avertissement affiché au démarrage du setup quand la suite tourne en mode live bridé. */
export const AVERTISSEMENT_MODE_LIVE_BRIDE =
  "⚠️ TEST_DATABASE_URL absent — tests exécutés contre la base LIVE avec connexions bridées " +
  "(décision founder 17.07). Provisionner une base de test après le lancement.";

export const MESSAGE_AUCUNE_URL_BASE_DE_TEST = [
  "[tests] Aucune URL de base disponible — les tests d'intégration ne peuvent pas tourner.",
  "",
  "Poser dans .env.local (ou dans l'environnement) :",
  "  - DATABASE_URL : mode live bridé par défaut (pool plafonné à 2, concurrence vitest",
  "    réduite — décision founder 17.07, en connaissance de cause) ;",
  "  - ou TEST_DATABASE_URL : base Supabase DÉDIÉE aux tests, plein régime (opt-in",
  "    recommandé après le lancement — migrations packages/db/migrations/ appliquées).",
  "Voir docs/architecture/dev-environment.md § « Base de tests ».",
].join("\n");

/**
 * URL factice syntaxiquement valide mais inconnectable (port 1, refus immédiat).
 * Sert de `DATABASE_URL` de substitution pour les runs unitaires sans aucune URL :
 * `@zarya/db` fait `new URL()` au chargement du module, mais un test unitaire pur
 * n'ouvre jamais de connexion.
 */
export const URL_FACTICE_TESTS_UNITAIRES =
  "postgresql://tests_unitaires:aucune_connexion@localhost:1/zarya_tests_sans_base";

/** Mode de la suite vis-à-vis de la base : dédiée (plein régime), live bridé, ou sans URL. */
export type ModeBaseDeTest = "dediee" | "live_bride" | "aucune_url";

export interface ResolutionBaseDeTest {
  mode: ModeBaseDeTest;
  /** URL retenue pour la suite (absente uniquement en mode « aucune_url »). */
  url?: string;
  /** Avertissement à afficher au démarrage du setup (mode « live_bride » uniquement). */
  avertissement?: string;
}

/**
 * Résout l'URL de base et le mode de bridage depuis l'environnement.
 *
 * Logique décisionnelle (décision founder 17.07.2026) :
 *  1. `TEST_DATABASE_URL` posée et ne contenant PAS la ref du projet de prod
 *     → base dédiée, plein régime.
 *  2. Sinon → mode live bridé : `TEST_DATABASE_URL` si posée (même pointant la prod),
 *     sinon repli sur `DATABASE_URL`. L'appelant applique les brides (pool ≤ 2,
 *     concurrence réduite) et affiche `avertissement`.
 *  3. Aucune URL exploitable (l'URL factice des runs unitaires ne compte pas)
 *     → mode « aucune_url » : l'appelant substitue l'URL factice et fait échouer
 *     les fichiers d'intégration avec `MESSAGE_AUCUNE_URL_BASE_DE_TEST`.
 */
export function resoudreBaseDeTest(
  env: Readonly<Record<string, string | undefined>>,
): ResolutionBaseDeTest {
  const urlDediee = env.TEST_DATABASE_URL?.trim();
  if (urlDediee && !urlDediee.includes(REF_PROJET_PROD)) {
    return { mode: "dediee", url: urlDediee };
  }

  const urlDatabase = env.DATABASE_URL?.trim();
  const urlLive =
    urlDediee || (urlDatabase !== URL_FACTICE_TESTS_UNITAIRES ? urlDatabase : undefined);
  if (!urlLive) {
    return { mode: "aucune_url" };
  }
  return { mode: "live_bride", url: urlLive, avertissement: AVERTISSEMENT_MODE_LIVE_BRIDE };
}

/** Vrai si le fichier appartient à la suite d'intégration (`tests/integration/**`). */
export function estCheminTestIntegration(cheminFichier: string): boolean {
  return cheminFichier.replaceAll("\\", "/").includes("/tests/integration/");
}
