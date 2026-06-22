import { escaladerRelances, genererBrouillonsRelances } from "@zarya/calendar";
import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Bloc C2a + Lot 6 — génération quotidienne des brouillons de relance (Vercel Cron).
// Mode A (validation humaine) : ce job crée les brouillons prêts à valider ; il
// n'envoie RIEN (l'envoi = C2b). Deux passes :
//   1. genererBrouillonsRelances — première relance (n°1) des échéances dues sans relance ;
//   2. escaladerRelances (Lot 6) — relance n°2/3… des échéances encore en retard dont la
//      dernière relance envoyée est mûre, avec ARRÊT après N relances (politique d'escalade).
// Protégé par CRON_SECRET (Vercel envoie `Authorization: Bearer ${CRON_SECRET}`).
// Job système → toutes les cabinets.

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const generation = await genererBrouillonsRelances();
    const escalade = await escaladerRelances();
    logger.info(
      { generation, escalade },
      "[calendar.generer-relances] génération + escalade terminées",
    );
    return NextResponse.json({ generation, escalade });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[calendar.generer-relances] échec de la génération",
    );
    return NextResponse.json({ error: "Échec de la génération" }, { status: 500 });
  }
}
