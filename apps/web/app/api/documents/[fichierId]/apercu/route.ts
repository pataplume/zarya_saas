import { createSupabaseAdminClient, createSupabaseServerClient } from "@zarya/auth";
import { db, document, fichierPhysique, uploadBrut } from "@zarya/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

// Aperçu / téléchargement d'un document — module Doc. Redirige vers une URL signée
// Supabase Storage (courte durée) pour ouvrir le fichier dans le navigateur, ou le
// télécharger (`?download=1`) via l'option `download` de Supabase Storage qui pose
// `Content-Disposition: attachment` côté Storage. Route handler car la réponse est
// une redirection HTTP, pas une mutation (cf. apps/web/CLAUDE.md).
// Lecture seule : tout membre du cabinet peut voir (y compris lecteur) ; l'espace
// client (client_contact) viendra plus tard — refusé ici.

export const runtime = "nodejs";

// Durée de validité de l'URL signée (secondes) — assez courte pour limiter le partage.
const SIGNED_URL_TTL_S = 300;

const ParamsSchema = z.object({ fichierId: z.string().uuid() });
const QuerySchema = z.object({ download: z.string().optional() });

/** Extension déjà présente dans un nom de fichier (sans le point), sinon null. */
function extensionDe(nom: string): string | null {
  const ext = nom.includes(".") ? nom.split(".").pop() : undefined;
  return ext && /^[a-zA-Z0-9]{1,8}$/.test(ext) ? ext.toLowerCase() : null;
}

/**
 * Nom de fichier proposé au téléchargement : `nom_fichier_standardise` (inclut déjà
 * l'extension, cf. `buildNomStandardise`) en priorité, sinon `libelle` du document
 * complété par l'extension du fichier stocké, sinon le nom d'upload d'origine, sinon
 * un nom générique. Jamais l'UUID du fichier physique.
 */
function nomTelechargement(candidats: {
  nom_fichier_standardise: string | null;
  libelle: string | null;
  nom_upload_original: string | null;
  storage_path: string;
}): string {
  if (candidats.nom_fichier_standardise) return candidats.nom_fichier_standardise;
  const extStockage = extensionDe(candidats.storage_path) ?? "bin";
  if (candidats.libelle) {
    return extensionDe(candidats.libelle)
      ? candidats.libelle
      : `${candidats.libelle}.${extStockage}`;
  }
  if (candidats.nom_upload_original) return candidats.nom_upload_original;
  return `document.${extStockage}`;
}

export async function GET(
  request: Request,
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

  // 2. Validation des paramètres (path + query).
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiant de fichier invalide" }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const query = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "Paramètre de requête invalide" }, { status: 400 });
  }
  const telecharger = query.data.download === "1";

  // 3. Lecture scopée cabinet (ADR 0005) — le filtre cabinet_id est OBLIGATOIRE :
  // le `db` applicatif bypasse la RLS. 404 indistinct si absent ou hors cabinet
  // (ne pas révéler l'existence cross-tenant). Jointures (document, upload_brut)
  // scopées cabinet_id également, pour le seul nom de fichier affiché au téléchargement.
  const rows = await db
    .select({
      storage_bucket: fichierPhysique.storage_bucket,
      storage_path: fichierPhysique.storage_path,
      nom_fichier_standardise: document.nom_fichier_standardise,
      libelle: document.libelle,
      nom_upload_original: uploadBrut.nom_fichier_original,
    })
    .from(fichierPhysique)
    .leftJoin(
      document,
      and(
        eq(document.fichier_physique_id, fichierPhysique.id),
        eq(document.cabinet_id, cabinet_id),
      ),
    )
    .leftJoin(
      uploadBrut,
      and(eq(uploadBrut.id, fichierPhysique.upload_brut_id), eq(uploadBrut.cabinet_id, cabinet_id)),
    )
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
  // En téléchargement, `download` pose Content-Disposition: attachment côté Storage
  // avec le nom lisible du document (jamais l'UUID du fichier physique).
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(row.storage_bucket)
    .createSignedUrl(
      row.storage_path,
      SIGNED_URL_TTL_S,
      telecharger ? { download: nomTelechargement(row) } : undefined,
    );
  if (error || !data?.signedUrl) {
    // Pas de PII dans les logs : on ne logge ni nom ni chemin de fichier.
    return NextResponse.json({ error: "Échec de la génération de l'aperçu" }, { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
