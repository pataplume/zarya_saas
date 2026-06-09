import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@zarya/auth";
import { db, fichierPhysique, uploadBrut } from "@zarya/db";
import { classifyDocument, ocrDocument, resolveExtractionModeForCabinet } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import { and, eq } from "drizzle-orm";

// Cœur d'ingestion documentaire PARTAGÉ : upload manuel (route /api/documents/upload) ET
// ingestion email (pièces jointes Microsoft). Pipeline : trace brute (upload_brut) → dédup
// par hash → stockage Supabase → fichier_physique → OCR (live) → classification → statut.
// Le `db` applicatif bypasse la RLS : sécurité multi-tenant = filtre cabinet_id discipliné
// (addendum ADR 0005). Tout est best-effort sur OCR/classif : un échec ne perd pas le fichier.

export const BUCKET = "documents";
export const MAX_TAILLE_OCTETS = 50 * 1024 * 1024; // 50 MB (doc.md § 17)

/** Types MIME acceptés à l'ingestion (upload + pièces jointes email). */
export const MIME_AUTORISES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type SourceIngestion = "upload_fiduciaire" | "upload_client" | "email_microsoft";

export interface IngestDocumentInput {
  cabinet_id: string;
  bytes: Buffer;
  nom_fichier: string;
  type_mime: string;
  taille_octets: number;
  source: SourceIngestion;
  /** Auteur (user_id) pour l'upload manuel ; null pour une ingestion système (email). */
  uploaded_par?: string | null;
  /** Client pré-rattaché (dépôt client) → classification forcée ; sinon l'IA résout. */
  client_id_connu?: string | null;
}

export interface IngestDocumentResult {
  status: "recu" | "doublon" | "erreur";
  fichier_physique_id?: string;
  upload_brut_id?: string;
}

function extensionDepuis(nom: string, mime: string): string {
  const fromNom = nom.includes(".") ? nom.split(".").pop()?.toLowerCase() : undefined;
  if (fromNom && /^[a-z0-9]{1,8}$/.test(fromNom)) return fromNom;
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/tiff": "tiff",
    "image/webp": "webp",
    "text/csv": "csv",
  };
  return map[mime] ?? "bin";
}

/**
 * Ingère un document (octets en mémoire) pour un cabinet : persistance + classification.
 * Idempotent par hash de contenu (un même fichier n'est stocké qu'une fois par cabinet).
 */
export async function ingestDocumentBytes(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  const { cabinet_id, bytes, nom_fichier, type_mime, taille_octets, source } = input;
  const clientId = input.client_id_connu ?? null;

  // 1. Trace brute de l'upload (toujours enregistrée, même si doublon).
  const hash_contenu = createHash("sha256").update(bytes).digest("hex");
  const [upload] = await db
    .insert(uploadBrut)
    .values({
      cabinet_id,
      source,
      ...(input.uploaded_par ? { uploaded_par: input.uploaded_par } : {}),
      ...(clientId ? { client_id: clientId } : {}),
      nom_fichier_original: nom_fichier,
      taille_octets,
      type_mime,
      hash_contenu,
    })
    .returning({ id: uploadBrut.id });
  if (!upload) return { status: "erreur" };

  // 2. Déduplication : un même contenu n'est stocké qu'une fois par cabinet.
  const [existant] = await db
    .select({ id: fichierPhysique.id })
    .from(fichierPhysique)
    .where(
      and(
        eq(fichierPhysique.cabinet_id, cabinet_id),
        eq(fichierPhysique.hash_contenu, hash_contenu),
      ),
    )
    .limit(1);
  if (existant) {
    await db.update(uploadBrut).set({ statut: "doublon" }).where(eq(uploadBrut.id, upload.id));
    return { status: "doublon", fichier_physique_id: existant.id, upload_brut_id: upload.id };
  }

  // 3. Stockage dans Supabase Storage (bucket privé, service role).
  const admin = createSupabaseAdminClient();
  const ext = extensionDepuis(nom_fichier, type_mime);
  const storage_path = `${cabinet_id}/${upload.id}.${ext}`;
  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .upload(storage_path, bytes, { contentType: type_mime, upsert: false });
  if (storageError) {
    await db.update(uploadBrut).set({ statut: "erreur" }).where(eq(uploadBrut.id, upload.id));
    return { status: "erreur", upload_brut_id: upload.id };
  }

  // 4. Référence du fichier physique.
  const [fichier] = await db
    .insert(fichierPhysique)
    .values({
      cabinet_id,
      hash_contenu,
      taille_octets,
      type_mime,
      storage_bucket: BUCKET,
      storage_path,
      source,
      upload_brut_id: upload.id,
    })
    .returning({ id: fichierPhysique.id });
  if (!fichier) {
    await db.update(uploadBrut).set({ statut: "erreur" }).where(eq(uploadBrut.id, upload.id));
    return { status: "erreur", upload_brut_id: upload.id };
  }

  // 5. OCR (best-effort, live uniquement) — texte natif PDF (gratuit) ou vision Infomaniak.
  let ocr_text: string | null = null;
  if ((await resolveExtractionModeForCabinet(cabinet_id)) === "live") {
    try {
      const ocr = await ocrDocument({
        cabinet_id,
        fichier_physique_id: fichier.id,
        bytes,
        type_mime,
        taille_octets,
        ...(input.uploaded_par ? { invoked_by_user_id: input.uploaded_par } : {}),
      });
      ocr_text = ocr.ocr_text;
      await db
        .update(fichierPhysique)
        .set({
          ocr_done: ocr.source === "pdf_natif" || ocr.source === "vision",
          ocr_text: ocr.ocr_text,
          ocr_invocation_id: ocr.invocation_id,
          ...(ocr.nb_pages != null ? { nb_pages: ocr.nb_pages } : {}),
        })
        .where(and(eq(fichierPhysique.id, fichier.id), eq(fichierPhysique.cabinet_id, cabinet_id)));
    } catch (err) {
      logger.error(
        {
          cabinet_id,
          upload_brut_id: upload.id,
          fichier_physique_id: fichier.id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[ingest] OCR échoué",
      );
    }
  }

  // 6. Classification IA → proposition en attente de validation (ADR 0007). Best-effort.
  try {
    const classif = await classifyDocument({
      cabinet_id,
      fichier_physique_id: fichier.id,
      nom_fichier,
      taille_octets,
      type_mime,
      ocr_text,
      ...(input.uploaded_par ? { invoked_by_user_id: input.uploaded_par } : {}),
      ...(clientId ? { client_id_connu: clientId } : {}),
    });
    await db
      .update(uploadBrut)
      .set({ statut: classif.auto_classe ? "valide" : "a_valider" })
      .where(eq(uploadBrut.id, upload.id));
  } catch (err) {
    logger.error(
      {
        cabinet_id,
        upload_brut_id: upload.id,
        fichier_physique_id: fichier.id,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      "[ingest] classification échouée",
    );
  }

  return { status: "recu", fichier_physique_id: fichier.id, upload_brut_id: upload.id };
}
