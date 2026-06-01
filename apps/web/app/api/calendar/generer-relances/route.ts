import { genererBrouillonsRelances } from "@zarya/calendar";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc C2a — génération quotidienne des brouillons de relance (Vercel Cron).
// Mode A (validation humaine) : ce job crée les brouillons prêts à valider ; il
// n'envoie RIEN (l'envoi = C2b). Protégé par CRON_SECRET (Vercel envoie
// `Authorization: Bearer ${CRON_SECRET}`). Job système → toutes les cabinets.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await genererBrouillonsRelances();
    logger.info({ ...result }, "[calendar.generer-relances] génération brouillons terminée");
    return NextResponse.json(result);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[calendar.generer-relances] échec de la génération",
    );
    return NextResponse.json({ error: "Échec de la génération" }, { status: 500 });
  }
}
