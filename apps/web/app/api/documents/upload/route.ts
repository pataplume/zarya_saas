import { createHash } from "node:crypto";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@zarya/auth";
import { db, fichierPhysique, uploadBrut } from "@zarya/db";
import { classifyDocument, ocrDocument, resolveExtractionModeForCabinet } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

// Upload manuel — module Doc (doc.md § 2.3). Les uploads passent par un route
// handler (cf. apps/web/CLAUDE.md), jamais par une server action.
// Pipeline : persistance brute (upload_brut + fichier_physique) puis
// classification IA (extraction.invocation + doc.proposition_classement) via
// @zarya/extraction. En mode stub (EXTRACTION_MODE=stub) la proposition est
// produite par heuristique locale ; le mode live (Infomaniak, ADR 0010) se
// rebranche sans toucher au flux.

export const runtime = "nodejs";

const BUCKET = "documents";
const MAX_TAILLE_OCTETS = 50 * 1024 * 1024; // 50 MB (doc.md § 17)

const MIME_AUTORISES = new Set([
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

// Rôles autorisés à uploader (lecteur = lecture seule)
const ROLES_UPLOAD = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

const MetaSchema = z.object({
  nom_fichier: z.string().min(1).max(512),
  type_mime: z.string().refine((m) => MIME_AUTORISES.has(m), {
    message: "Type de fichier non supporté",
  }),
  taille_octets: z.number().int().positive().max(MAX_TAILLE_OCTETS),
});

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authentification
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    return NextResponse.json({ error: "Cabinet non configuré" }, { status: 403 });
  }

  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  // Run B1 — un contact RH client (role client_contact) peut DÉPOSER pour SON client.
  // Le client_id est lu UNIQUEMENT depuis le JWT (app_metadata), jamais depuis le body
  // → un client ne peut pas usurper un autre client/cabinet (anti-fuite).
  const isClientContact = role === "client_contact";
  const clientIdContact = user.app_metadata.client_id as string | undefined;
  if (isClientContact) {
    if (!clientIdContact) {
      return NextResponse.json({ error: "Compte client incomplet" }, { status: 403 });
    }
  } else if (!ROLES_UPLOAD.has(role)) {
    return NextResponse.json({ error: "Action non autorisée pour votre rôle" }, { status: 403 });
  }

  // 2. Lecture du fichier (multipart/form-data)
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête multipart invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  const parsed = MetaSchema.safeParse({
    nom_fichier: file.name,
    type_mime: file.type,
    taille_octets: file.size,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Fichier invalide" },
      { status: 400 },
    );
  }
  const { nom_fichier, type_mime, taille_octets } = parsed.data;

  // 3. Hash de contenu SHA-256 (déduplication)
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash_contenu = createHash("sha256").update(bytes).digest("hex");

  // 4. Trace brute de l'upload (toujours enregistrée, même si doublon)
  const [upload] = await db
    .insert(uploadBrut)
    .values({
      cabinet_id,
      source: isClientContact ? "upload_client" : "upload_fiduciaire",
      uploaded_par: user.id,
      // Dépôt client : pré-rattaché à SON client (JWT). Fiduciaire : NULL → l'IA résout.
      ...(isClientContact && clientIdContact ? { client_id: clientIdContact } : {}),
      nom_fichier_original: nom_fichier,
      taille_octets,
      type_mime,
      hash_contenu,
    })
    .returning({ id: uploadBrut.id });

  if (!upload) {
    return NextResponse.json({ error: "Échec de l'enregistrement" }, { status: 500 });
  }

  // 5. Déduplication : un même contenu n'est stocké qu'une fois par cabinet
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
    return NextResponse.json({ status: "doublon", fichier_physique_id: existant.id });
  }

  // 6. Stockage dans Supabase Storage (bucket privé, service role)
  const admin = createSupabaseAdminClient();
  const ext = extensionDepuis(nom_fichier, type_mime);
  const storage_path = `${cabinet_id}/${upload.id}.${ext}`;

  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .upload(storage_path, bytes, { contentType: type_mime, upsert: false });

  if (storageError) {
    await db.update(uploadBrut).set({ statut: "erreur" }).where(eq(uploadBrut.id, upload.id));
    return NextResponse.json({ error: "Échec du stockage du fichier" }, { status: 502 });
  }

  // 7. Référence du fichier physique
  const [fichier] = await db
    .insert(fichierPhysique)
    .values({
      cabinet_id,
      hash_contenu,
      taille_octets,
      type_mime,
      storage_bucket: BUCKET,
      storage_path,
      source: "upload_fiduciaire",
      upload_brut_id: upload.id,
    })
    .returning({ id: fichierPhysique.id });

  if (!fichier) {
    await db.update(uploadBrut).set({ statut: "erreur" }).where(eq(uploadBrut.id, upload.id));
    return NextResponse.json({ error: "Échec de l'enregistrement du fichier" }, { status: 500 });
  }

  // 8. OCR (Phase 4.1) — texte natif PDF (gratuit) ou vision Infomaniak (images).
  // Uniquement en mode live : en stub (défaut prod), comportement inchangé
  // (classification sur le nom de fichier). L'OCR est best-effort et NON bloquant :
  // un échec (ex. live sans credentials IK, rate-limit) laisse le document
  // classable sur son nom, sans perdre le fichier. Le texte extrait alimente la
  // classification en aval. Les bytes sont déjà en mémoire (pas de re-download).
  let ocr_text: string | null = null;
  if ((await resolveExtractionModeForCabinet(cabinet_id)) === "live") {
    try {
      const ocr = await ocrDocument({
        cabinet_id,
        fichier_physique_id: fichier.id,
        bytes,
        type_mime,
        taille_octets,
        invoked_by_user_id: user.id,
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
        // Scope cabinet_id en plus de l'id (le db applicatif bypasse la RLS —
        // sécurité multi-tenant = filtre cabinet_id discipliné, addendum ADR 0005).
        .where(and(eq(fichierPhysique.id, fichier.id), eq(fichierPhysique.cabinet_id, cabinet_id)));
    } catch (err) {
      // OCR best-effort : on logge (contexte cabinet_id, jamais de PII) et on
      // poursuit la classification sans texte OCR.
      logger.error(
        {
          cabinet_id,
          upload_brut_id: upload.id,
          fichier_physique_id: fichier.id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[doc.upload] OCR échoué",
      );
    }
  }

  // 9. Classification IA → proposition en attente de validation (ADR 0007).
  // Un échec de classification ne perd pas le fichier : il reste 'recu',
  // reclassable plus tard. On ne bloque donc pas la réponse d'upload.
  try {
    const classif = await classifyDocument({
      cabinet_id,
      fichier_physique_id: fichier.id,
      nom_fichier,
      taille_octets,
      type_mime,
      ocr_text,
      invoked_by_user_id: user.id,
      // Dépôt client : le client est CONNU (JWT) → on force le rattachement (pas de devinette IA).
      ...(isClientContact && clientIdContact ? { client_id_connu: clientIdContact } : {}),
    });
    // B4 — auto-classé (doc.document créé sans humain) → 'valide' ; sinon file 'a_valider'.
    await db
      .update(uploadBrut)
      .set({ statut: classif.auto_classe ? "valide" : "a_valider" })
      .where(eq(uploadBrut.id, upload.id));
  } catch (err) {
    // Le fichier est stocké ; il reste 'recu' et reclassable plus tard.
    // On n'avale PAS l'erreur en silence : sans trace, un échec de
    // classification (ex. mode live sans credentials Infomaniak) laisse le
    // document bloqué sur 'recu' sans aucun signal (cf. security-and-audit.md
    // § erreurs : contexte cabinet_id, jamais de PII → pas de nom_fichier).
    logger.error(
      {
        cabinet_id,
        upload_brut_id: upload.id,
        fichier_physique_id: fichier.id,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      "[doc.upload] classification échouée",
    );
  }

  return NextResponse.json({ status: "recu", fichier_physique_id: fichier.id });
}
