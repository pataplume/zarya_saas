import { logger } from "@zarya/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { processPendingEmails } from "@/lib/process-emails";
import { reprocessPendingDocuments } from "@/lib/reprocess-documents";

export const runtime = "nodejs";
// Le téléchargement des pièces jointes + OCR + classif peut être long sur un lot.
export const maxDuration = 300;

// Job système (toutes cabinets), protégé par CRON_SECRET :
//  1. ingère les pièces jointes des emails reçus (doc.email_brut 'recu') → documents classés ;
//  2. RECLASSE les documents bloqués en 'recu' (classification jamais aboutie).
// Filet périodique ; le webhook déclenche aussi le (1) en temps quasi-réel.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const emails = await processPendingEmails();
    const reclassement = await reprocessPendingDocuments();
    logger.info({ emails, reclassement }, "[documents.process-emails] traitement terminé");
    return NextResponse.json({ emails, reclassement });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : "inconnu" },
      "[documents.process-emails] échec du traitement",
    );
    return NextResponse.json({ error: "Échec du traitement" }, { status: 500 });
  }
}
