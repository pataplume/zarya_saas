import { createSupabaseServerClient } from "@zarya/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocumentBytes, MAX_TAILLE_OCTETS, MIME_AUTORISES } from "@/lib/ingest-document";

// Upload manuel — module Doc (doc.md § 2.3). Les uploads passent par un route handler
// (cf. apps/web/CLAUDE.md), jamais par une server action. Le pipeline réel (persistance brute +
// stockage + OCR + classification) vit dans le cœur partagé `ingestDocumentBytes` (réutilisé
// par l'ingestion email). Ici : auth + lecture multipart + délégation.

export const runtime = "nodejs";

// Rôles autorisés à uploader (lecteur = lecture seule).
const ROLES_UPLOAD = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

const MetaSchema = z.object({
  nom_fichier: z.string().min(1).max(512),
  type_mime: z.string().refine((m) => MIME_AUTORISES.has(m), {
    message: "Type de fichier non supporté",
  }),
  taille_octets: z.number().int().positive().max(MAX_TAILLE_OCTETS),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authentification.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const cabinet_id = user.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) return NextResponse.json({ error: "Cabinet non configuré" }, { status: 403 });

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

  // 2. Lecture du fichier (multipart/form-data).
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

  // 3. Ingestion (persistance + stockage + OCR + classification) via le cœur partagé.
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await ingestDocumentBytes({
    cabinet_id,
    bytes,
    nom_fichier: parsed.data.nom_fichier,
    type_mime: parsed.data.type_mime,
    taille_octets: parsed.data.taille_octets,
    source: isClientContact ? "upload_client" : "upload_fiduciaire",
    uploaded_par: user.id,
    // Dépôt client : client CONNU (JWT) → rattachement forcé (pas de devinette IA).
    ...(isClientContact && clientIdContact ? { client_id_connu: clientIdContact } : {}),
  });

  if (result.status === "erreur") {
    return NextResponse.json({ error: "Échec de l'enregistrement du document" }, { status: 502 });
  }
  return NextResponse.json({
    status: result.status,
    fichier_physique_id: result.fichier_physique_id,
  });
}
