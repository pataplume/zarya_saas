import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { processPendingEmails } from "@/lib/process-emails";

export const runtime = "nodejs";
// Le téléchargement des pièces jointes + OCR + classif peut être long sur un lot.
export const maxDuration = 300;

// Traitement des emails ingérés (doc.email_brut 'recu') → pièces jointes → documents classés.
// Filet quotidien (le webhook déclenche aussi en temps quasi-réel). Job système → toutes cabinets.
// Protégé par CRON_SECRET (Vercel envoie `Authorization: Bearer ${CRON_SECRET}`).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await processPendingEmails();
    logger.info({ ...result }, "[documents.process-emails] traitement terminé");
    return NextResponse.json(result);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[documents.process-emails] échec du traitement",
    );
    return NextResponse.json({ error: "Échec du traitement" }, { status: 500 });
  }
}
