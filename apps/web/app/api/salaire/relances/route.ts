import { escaladerPeriodesEnRetard, genererBrouillonsRelancesSalaire } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc G5b — relances salaire (Vercel Cron quotidien). Mode A : génère les BROUILLONS de
// relance (sans envoi ; l'envoi = validation humaine) + escalade les périodes en retard.
// Protégé par CRON_SECRET. Job système → tous les cabinets.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const now = new Date();
  const annee = now.getUTCFullYear();
  const mois = now.getUTCMonth() + 1;
  try {
    const brouillons = await genererBrouillonsRelancesSalaire({ annee, mois });
    const escalade = await escaladerPeriodesEnRetard({ annee, mois });
    logger.info({ annee, mois, ...brouillons, ...escalade }, "[salaire.relances] cycle terminé");
    return NextResponse.json({ annee, mois, ...brouillons, ...escalade });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[salaire.relances] échec",
    );
    return NextResponse.json({ error: "Échec des relances" }, { status: 500 });
  }
}
