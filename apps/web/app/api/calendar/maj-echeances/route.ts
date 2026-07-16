import { majEcheancesEtRisque } from "@zarya/calendar";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pingCronHeartbeat } from "@/lib/ops/heartbeat";

const HEARTBEAT_SLUG = "calendar-maj-echeances";

// Bloc C4 — maintenance quotidienne des échéances (Vercel Cron). Fait progresser les
// statuts (a_venir→imminente→en_retard) puis recalcule le risque des clients en retard
// (ce que la pg_cron horaire SQL ne peut pas faire). Protégé par CRON_SECRET.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await majEcheancesEtRisque();
    logger.info({ ...result }, "[calendar.maj-echeances] maintenance terminée");
    await pingCronHeartbeat(HEARTBEAT_SLUG, true);
    return NextResponse.json(result);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[calendar.maj-echeances] échec de la maintenance",
    );
    await pingCronHeartbeat(HEARTBEAT_SLUG, false);
    return NextResponse.json({ error: "Échec de la maintenance" }, { status: 500 });
  }
}
