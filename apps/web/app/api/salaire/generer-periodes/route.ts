import { genererPeriodesMensuelles } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc G2 — génération mensuelle des périodes de paie (Vercel Cron, mensuel).
// App-code : crée la période du mois courant pour chaque client éligible (service salaires
// actif + config paie + onboarding terminé), prépopule depuis M-1, crée l'échéance liée.
// Idempotent. Protégé par CRON_SECRET. Job système → tous les cabinets.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Mois courant (le cron tourne en début de mois pour la période du mois en cours).
  const now = new Date();
  const annee = now.getUTCFullYear();
  const mois = now.getUTCMonth() + 1;

  try {
    const result = await genererPeriodesMensuelles({ annee, mois });
    logger.info({ annee, mois, ...result }, "[salaire.generer-periodes] génération terminée");
    return NextResponse.json({ annee, mois, ...result });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[salaire.generer-periodes] échec de la génération",
    );
    return NextResponse.json({ error: "Échec de la génération" }, { status: 500 });
  }
}
