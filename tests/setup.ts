/**
 * Setup global des tests ZARYA.
 * Charge les variables d'environnement depuis .env.local avant tous les tests.
 * En CI, les variables sont injectées directement via les secrets GitHub Actions.
 */

import dns from "node:dns";
import path from "node:path";
import { config } from "dotenv";
import { beforeAll, expect } from "vitest";
import {
  estCheminTestIntegration,
  MESSAGE_AUCUNE_URL_BASE_DE_TEST,
  POOL_MAX_MODE_LIVE_BRIDE,
  resoudreBaseDeTest,
  URL_FACTICE_TESTS_UNITAIRES,
} from "./integration/helpers/base-de-test";

// GitHub Actions runners n'ont pas de connectivité IPv6 vers Supabase Cloud.
// dns.setDefaultResultOrder('ipv4first') force la résolution DNS à préférer
// les adresses IPv4, évitant l'erreur ENETUNREACH sur les runners Linux.
dns.setDefaultResultOrder("ipv4first");

config({ path: path.resolve(process.cwd(), ".env.local") });

// ── Base de tests : mode live bridé par défaut (P0-2 amendé, décision founder 17.07.2026) ────
// Incident du 16.07.2026 : DATABASE_URL de .env.local pointait la PROD ; `pnpm test` a saturé
// ses connexions Postgres (53300) et rendu les pages prod indisponibles ~2 min. Pas de base de
// test dédiée avant le lancement (décision founder) → la suite tourne contre la base LIVE, en
// connaissance de cause, avec des brides automatiques :
//  1) TEST_DATABASE_URL posée (base dédiée) → plein régime, réinjectée comme DATABASE_URL pour
//     que TOUT le code (dont le singleton @zarya/db, qui la lit au chargement du module) pointe
//     la base de test — porte opt-in pour l'après-lancement ;
//  2) sinon → repli sur DATABASE_URL (même la prod) MAIS pool plafonné (DB_POOL_MAX forcé à 2
//     ICI, AVANT tout import de @zarya/db par les fichiers de test) + concurrence vitest réduite
//     (cf. vitest.config.ts) + avertissement console explicite ;
//  3) aucune URL → URL factice inconnectable (les tests unitaires purs n'ouvrent aucune
//     connexion) et échec immédiat de tout fichier de tests/integration/ avec la marche à suivre.
const resolutionBase = resoudreBaseDeTest(process.env);
switch (resolutionBase.mode) {
  case "dediee":
    process.env.DATABASE_URL = resolutionBase.url;
    break;
  case "live_bride":
    // Bride 1 : pool plafonné par process — @zarya/db lit DB_POOL_MAX au chargement du module,
    // et setup.ts tourne AVANT l'import des fichiers de test → la borne est toujours effective.
    process.env.DB_POOL_MAX = POOL_MAX_MODE_LIVE_BRIDE;
    // Libère vite les slots entre fichiers (la base live les partage avec l'app).
    process.env.DB_IDLE_TIMEOUT ??= "10";
    process.env.DATABASE_URL = resolutionBase.url;
    // biome-ignore lint/suspicious/noConsole: avertissement volontaire du mode live bridé.
    console.warn(resolutionBase.avertissement);
    break;
  case "aucune_url":
    process.env.DATABASE_URL = URL_FACTICE_TESTS_UNITAIRES;
    beforeAll((suite) => {
      const chemin =
        (suite as { filepath?: string } | undefined)?.filepath ?? expect.getState().testPath ?? "";
      if (estCheminTestIntegration(chemin)) {
        throw new Error(MESSAGE_AUCUNE_URL_BASE_DE_TEST);
      }
    });
    break;
}

// Force le mode d'extraction STUB pour toute la suite (déterministe, ZÉRO appel réseau IA).
// `.env.local` porte souvent EXTRACTION_MODE=live (sonde golden set) ; sans ce garde-fou, les
// chemins qui résolvent l'extracteur au runtime (classifyDocument, hook facture de
// finaliserDocument…) taperaient la vraie API Infomaniak en test → lenteur + flakes 429/timeout.
// Le run d'éval live explicite reste possible : il pose RUN_LIVE_EVAL=1 (et EXTRACTION_MODE=live).
if (process.env.RUN_LIVE_EVAL !== "1") {
  process.env.EXTRACTION_MODE = "stub";
}
