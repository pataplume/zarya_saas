// Instrumentation client Next.js (15.3+) — Sentry navigateur, OPTIONNEL (P0-1).
// No-op sans NEXT_PUBLIC_SENTRY_DSN (inline au build : sans la variable, le init
// n'est jamais exécuté). Erreurs uniquement, pas de replay ni de tracing.
//
// ⚠️ PII : sendDefaultPii désactivé (défaut) — pas d'IP/headers dans les événements.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Hook navigation App Router (requis par le SDK ; inoffensif sans init).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
