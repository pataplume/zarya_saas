import { roulerHorizonEcheances } from "@zarya/calendar";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pingCronHeartbeat } from "@/lib/ops/heartbeat";

const HEARTBEAT_SLUG = "calendar-horizon-echeances";

// Lot 6 (ADR 0025 / ADR 0011 Run 6) — cron « horizon » des échéances (Vercel Cron, quotidien).
// Roule l'horizon roulant : matérialise les NOUVELLES occurrences entrant dans la fenêtre
// [today, today+12 mois] pour tous les clients actifs, à mesure que les périodes se clôturent.
// Réutilise genererEcheancesPourClient → MÊME idempotence (clé client_id×template_id×date) :
// rejouer ne crée aucun doublon. Protégé par CRON_SECRET. Job système → tous les cabinets.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await roulerHorizonEcheances();
    logger.info({ ...result }, "[calendar.horizon-echeances] roulement de l'horizon terminé");
    await pingCronHeartbeat(HEARTBEAT_SLUG, true);
    return NextResponse.json(result);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[calendar.horizon-echeances] échec du roulement de l'horizon",
    );
    await pingCronHeartbeat(HEARTBEAT_SLUG, false);
    return NextResponse.json({ error: "Échec du roulement de l'horizon" }, { status: 500 });
  }
}
