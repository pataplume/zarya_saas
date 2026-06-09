import { ingestEmailNotification, parseGraphNotifications } from "@zarya/integrations";
import { logger } from "@zarya/logger";
import { after, type NextRequest, NextResponse } from "next/server";
import { processPendingEmails } from "@/lib/process-emails";

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

  let ingested = false;
  for (const notif of notifications) {
    try {
      const status = await ingestEmailNotification(notif);
      if (status === "ingested") ingested = true;
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

  // Traitement temps quasi-réel APRÈS la réponse (ne retarde pas l'accusé Graph). Déclenché
  // uniquement si un email a réellement été ingéré (clientState vérifié) → pas d'abus de
  // l'endpoint public. Le cron /api/documents/process-emails reste le filet de sécurité.
  if (ingested) {
    after(async () => {
      try {
        await processPendingEmails({ limit: 25 });
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : "inconnu" },
          "[microsoft.webhook] traitement post-réponse échoué",
        );
      }
    });
  }

  // 202 Accepted : reçu, traité au mieux. Graph ne rejoue pas.
  return new NextResponse(null, { status: 202 });
}
