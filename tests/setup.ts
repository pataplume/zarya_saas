/**
 * Setup global des tests ZARYA.
 * Charge les variables d'environnement depuis .env.local avant tous les tests.
 * En CI, les variables sont injectées directement via les secrets GitHub Actions.
 */

import dns from "node:dns";
import path from "node:path";
import { config } from "dotenv";

// GitHub Actions runners n'ont pas de connectivité IPv6 vers Supabase Cloud.
// dns.setDefaultResultOrder('ipv4first') force la résolution DNS à préférer
// les adresses IPv4, évitant l'erreur ENETUNREACH sur les runners Linux.
dns.setDefaultResultOrder("ipv4first");

config({ path: path.resolve(process.cwd(), ".env.local") });

// Force le mode d'extraction STUB pour toute la suite (déterministe, ZÉRO appel réseau IA).
// `.env.local` porte souvent EXTRACTION_MODE=live (sonde golden set) ; sans ce garde-fou, les
// chemins qui résolvent l'extracteur au runtime (classifyDocument, hook facture de
// finaliserDocument…) taperaient la vraie API Infomaniak en test → lenteur + flakes 429/timeout.
// Le run d'éval live explicite reste possible : il pose RUN_LIVE_EVAL=1 (et EXTRACTION_MODE=live).
if (process.env.RUN_LIVE_EVAL !== "1") {
  process.env.EXTRACTION_MODE = "stub";
}
