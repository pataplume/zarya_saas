import { renewExpiringSubscriptions } from "@zarya/integrations";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pingCronHeartbeat } from "@/lib/ops/heartbeat";

const HEARTBEAT_SLUG = "microsoft-renew";

// Bloc D4c — renouvellement des subscriptions Graph (Vercel Cron quotidien).
// Les subscriptions expirent à 72 h max ; ce job prolonge celles arrivant à échéance.
// Protégé par CRON_SECRET (Vercel envoie `Authorization: Bearer ${CRON_SECRET}`).
// pg_cron impossible ici : chaque renouvellement = un appel Graph tokené (TS, pas SQL).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await renewExpiringSubscriptions();
    logger.info({ ...result }, "[microsoft.renew] renouvellement subscriptions terminé");
    await pingCronHeartbeat(HEARTBEAT_SLUG, true);
    return NextResponse.json(result);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[microsoft.renew] échec du job de renouvellement",
    );
    await pingCronHeartbeat(HEARTBEAT_SLUG, false);
    return NextResponse.json({ error: "Échec du renouvellement" }, { status: 500 });
  }
}
