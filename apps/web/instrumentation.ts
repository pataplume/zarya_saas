// Instrumentation Next.js — Sentry côté serveur (P0-1 observabilité, AUDIT-MVP.md §8).
// Minimal et no-op sans DSN : Sentry.init n'est appelé que si SENTRY_DSN est défini
// (dev/local sans compte Sentry = zéro effet). Pas d'upload de sourcemaps (nécessite
// SENTRY_AUTH_TOKEN + withSentryConfig — TODO ops, cf. PR).
//
// ⚠️ PII : sendDefaultPii désactivé (défaut Sentry) — pas de cookies/headers/IP dans
// les événements. Ne jamais ajouter de contexte métier (IBAN, AVS, noms clients).

import * as Sentry from "@sentry/nextjs";

export function register(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Erreurs uniquement au MVP — pas de tracing (coût + bruit).
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Capture les erreurs non gérées des Server Components / Route Handlers / Server Actions.
// Sans init (DSN absent), le SDK ignore silencieusement les captures.
export const onRequestError = Sentry.captureRequestError;
