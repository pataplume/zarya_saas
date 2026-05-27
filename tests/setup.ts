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
