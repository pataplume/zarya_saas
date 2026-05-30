// Logger serveur structuré — pino + redact (ADR 0017, CLAUDE.md §2).
//
// Deux lignes de défense, dans l'ordre :
//  1. DISCIPLINE (règle première) : ne JAMAIS passer un secret brut dans le contexte d'un
//     log. Les sites de log portent cabinet_id / ids techniques / `error.name: message` —
//     jamais de token, IBAN, AVS, nom de fichier client, ni corps de requête tiers.
//  2. REDACT pino (filet) : censure les clés sensibles connues si elles fuitent malgré tout.
//
// Limite assumée : le moteur redact de pino (fast-redact) matche par CHEMIN et `*` ne couvre
// qu'UN niveau — pas de glob suffixe récursif type `*_token`. On traduit donc la spec
// CLAUDE.md en liste explicite de clés concrètes, étendue au fil des nouveaux sites de log.
//
// Serveur uniquement : ne jamais importer depuis du code client navigateur (`use client`).

import { pino } from "pino";

// Clés sensibles concrètes loguées dans le repo + génériques (CLAUDE.md §2).
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "ZEFIX_PASSWORD",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "token",
  "secret",
] as const;

// Racine + un niveau imbriqué (`*.key`) + en-têtes HTTP (`req.headers.key`).
// Exporté pour que les tests exercent la config réelle (pas une copie).
export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `req.headers.${key}`,
]);

export const REDACT_CENSOR = "[redacted]";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // Pas de pid/hostname : bruit inutile en serverless (Vercel Runtime Logs).
  // pino retire ces champs sur `base: null` (et non `undefined`).
  base: null,
  redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
});

/** Logger enfant avec contexte attaché (ex. `{ cabinet_id }`) — hérite du redact. */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export type Logger = typeof logger;
