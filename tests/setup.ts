/**
 * Setup global des tests ZARYA.
 * Charge les variables d'environnement depuis .env.local avant tous les tests.
 * En CI, les variables sont injectées directement via les secrets GitHub Actions.
 */

import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.local") });
