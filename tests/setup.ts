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
  MESSAGE_TEST_DATABASE_URL_MANQUANTE,
  resoudreUrlBaseDeTest,
  URL_FACTICE_TESTS_UNITAIRES,
} from "./integration/helpers/base-de-test";

// GitHub Actions runners n'ont pas de connectivité IPv6 vers Supabase Cloud.
// dns.setDefaultResultOrder('ipv4first') force la résolution DNS à préférer
// les adresses IPv4, évitant l'erreur ENETUNREACH sur les runners Linux.
dns.setDefaultResultOrder("ipv4first");

config({ path: path.resolve(process.cwd(), ".env.local") });

// ── Garde-fou base de tests (P0-2, AUDIT-MVP.md § 8) ─────────────────────────────────────────
// Incident du 16.07.2026 : DATABASE_URL de .env.local pointait la PROD ; `pnpm test` a saturé
// ses connexions Postgres (53300) et rendu les pages prod indisponibles ~2 min. Depuis :
//  1) DATABASE_URL est TOUJOURS écartée du process de test — aucun code (dont le singleton
//     @zarya/db, qui la lit au chargement du module) ne peut plus atteindre la base de prod ;
//  2) si TEST_DATABASE_URL est posée : validée (jette immédiatement si elle contient la ref du
//     projet de prod) puis réinjectée comme DATABASE_URL — la suite ne connaît QUE la base de
//     test, y compris via les modules qui lisent encore DATABASE_URL (client @zarya/db) ;
//  3) sinon : URL factice inconnectable (les tests unitaires purs n'ouvrent aucune connexion)
//     et échec immédiat de tout fichier de tests/integration/ avec la marche à suivre.
delete process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = resoudreUrlBaseDeTest(process.env);
} else {
  process.env.DATABASE_URL = URL_FACTICE_TESTS_UNITAIRES;
  beforeAll((suite) => {
    const chemin =
      (suite as { filepath?: string } | undefined)?.filepath ?? expect.getState().testPath ?? "";
    if (estCheminTestIntegration(chemin)) {
      throw new Error(MESSAGE_TEST_DATABASE_URL_MANQUANTE);
    }
  });
}

// Force le mode d'extraction STUB pour toute la suite (déterministe, ZÉRO appel réseau IA).
// `.env.local` porte souvent EXTRACTION_MODE=live (sonde golden set) ; sans ce garde-fou, les
// chemins qui résolvent l'extracteur au runtime (classifyDocument, hook facture de
// finaliserDocument…) taperaient la vraie API Infomaniak en test → lenteur + flakes 429/timeout.
// Le run d'éval live explicite reste possible : il pose RUN_LIVE_EVAL=1 (et EXTRACTION_MODE=live).
if (process.env.RUN_LIVE_EVAL !== "1") {
  process.env.EXTRACTION_MODE = "stub";
}
