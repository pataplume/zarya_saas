import { ingestEmailNotification, parseGraphNotifications } from "@zarya/integrations";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc D4b — endpoint webhook Microsoft Graph (notifications email temps réel).
// PUBLIC (appelé par Microsoft, sans session) : l'authentification repose sur le
// `clientState` secret stocké par subscription (vérifié dans ingestEmailNotification),
// pas sur une session. Voir microsoft-integration.md §4.
//
// Deux usages sur le même POST :
//  1. Handshake : à la création d'une subscription, Microsoft POST avec ?validationToken
//     et attend l'echo en text/plain sous 10 s.
//  2. Notifications : body { value: [...] } → ingestion idempotente dans doc.email_brut.
//     On répond TOUJOURS 202 (même en cas de notif invalide) pour éviter les rejeux.

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  const validationToken = new URL(request.url).searchParams.get("validationToken");
  if (validationToken) {
    // Echo brut, text/plain (exigé par Graph pour valider l'URL de notification).
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const body = await request.json().catch(() => null);
  const notifications = parseGraphNotifications(body);

  for (const notif of notifications) {
    try {
      const status = await ingestEmailNotification(notif);
      if (status === "unauthorized" || status === "unknown_subscription") {
        logger.warn(
          { subscription_id: notif.subscriptionId, status },
          "[microsoft.webhook] notification rejetée",
        );
      }
    } catch (err) {
      // Best-effort : un échec d'ingestion ne doit pas provoquer un rejeu en boucle.
      logger.error(
        {
          subscription_id: notif.subscriptionId,
          error: err instanceof Error ? err.message : "inconnu",
        },
        "[microsoft.webhook] ingestion notification échouée",
      );
    }
  }

  // 202 Accepted : reçu, traité au mieux. Graph ne rejoue pas.
  return new NextResponse(null, { status: 202 });
}
