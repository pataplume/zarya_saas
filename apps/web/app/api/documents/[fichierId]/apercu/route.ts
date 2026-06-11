import { createSupabaseAdminClient, createSupabaseServerClient } from "@zarya/auth";
import { db, fichierPhysique } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

// Aperçu d'un document — module Doc. Redirige vers une URL signée Supabase Storage
// (courte durée) pour ouvrir le fichier dans le navigateur. Route handler car la
// réponse est une redirection HTTP, pas une mutation (cf. apps/web/CLAUDE.md).
// Lecture seule : tout membre du cabinet peut voir (y compris lecteur) ; l'espace
// client (client_contact) viendra plus tard — refusé ici.

export const runtime = "nodejs";

// Durée de validité de l'URL signée (secondes) — assez courte pour limiter le partage.
const SIGNED_URL_TTL_S = 300;

const ParamsSchema = z.object({ fichierId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fichierId: string }> },
): Promise<NextResponse> {
  // 1. Authentification.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return NextResponse.json({ error: "Cabinet non configuré" }, { status: 403 });

  // Le hub documents est côté fiduciaire : un contact client n'y accède pas.
  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  if (role === "client_contact") {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }

  // 2. Validation du paramètre.
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de fichier invalide" }, { status: 400 });
  }

  // 3. Lecture scopée cabinet (ADR 0005) — le filtre cabinet_id est OBLIGATOIRE :
  // le `db` applicatif bypasse la RLS. 404 indistinct si absent ou hors cabinet
  // (ne pas révéler l'existence cross-tenant).
  const rows = await db
    .select({
      storage_bucket: fichierPhysique.storage_bucket,
      storage_path: fichierPhysique.storage_path,
    })
    .from(fichierPhysique)
    .where(
      and(
        eq(fichierPhysique.id, parsed.data.fichierId),
        eq(fichierPhysique.cabinet_id, cabinet_id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  if (!row.storage_bucket) {
    // Fichier sans bucket (provider non-Supabase ou ingestion incomplète) : pas d'aperçu possible.
    return NextResponse.json({ error: "Fichier non disponible" }, { status: 502 });
  }

  // 4. URL signée courte durée (service role côté serveur uniquement) puis redirection.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_S);
  if (error || !data?.signedUrl) {
    // Pas de PII dans les logs : on ne logge ni nom ni chemin de fichier.
    return NextResponse.json({ error: "Échec de la génération de l'aperçu" }, { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
