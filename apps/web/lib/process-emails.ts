import { db, emailBrut } from "@zarya/db";
import { type AttachmentMeta, MicrosoftGraphClient } from "@zarya/integrations";
import { logger } from "@zarya/logger";
import { and, asc, eq } from "drizzle-orm";
import {
  type IngestDocumentInput,
  type IngestDocumentResult,
  ingestDocumentBytes,
  MAX_TAILLE_OCTETS,
  MIME_AUTORISES,
} from "./ingest-document";

// Traitement des emails ingérés (doc.email_brut) → pièces jointes → documents classés.
// Le webhook (D4) persiste l'email ; ICI on télécharge les pièces jointes via Graph et on
// les passe dans le cœur d'ingestion partagé (même pipeline que l'upload manuel). Idempotent :
// chaque email passe `recu → traite | ignore | erreur`. Scopé cabinet (token Graph du cabinet).

/** Taille minimale d'une pièce IMAGE pour être considérée comme un document (sinon logo/signature). */
const MIN_IMAGE_OCTETS = 20 * 1024;
/** Nombre d'emails traités par passage. */
const DEFAULT_LIMIT = 50;

// Surface Graph minimale (injectable pour tests).
export interface GraphAttachmentSource {
  listAttachments(messageId: string): Promise<AttachmentMeta[]>;
  downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer>;
}

export interface ProcessEmailsDeps {
  /** Fabrique le client Graph d'un cabinet (défaut : MicrosoftGraphClient réel). */
  makeGraphClient?: (cabinet_id: string) => GraphAttachmentSource;
  /** Cœur d'ingestion (défaut : ingestDocumentBytes — persistance + storage + classif). */
  ingest?: (input: IngestDocumentInput) => Promise<IngestDocumentResult>;
}

export interface ProcessEmailsResult {
  traite: number;
  ignore: number;
  erreur: number;
  documents: number;
}

/** Une pièce jointe est-elle un document ingérable (≠ inline, type autorisé, taille plausible) ? */
function estDocumentIngerable(att: AttachmentMeta): boolean {
  if (!att.isFile || att.isInline) return false;
  if (!att.contentType || !MIME_AUTORISES.has(att.contentType)) return false;
  const taille = att.size ?? 0;
  if (taille <= 0 || taille > MAX_TAILLE_OCTETS) return false;
  // Les petites images sont des logos/signatures, pas des documents.
  if (att.contentType.startsWith("image/") && taille < MIN_IMAGE_OCTETS) return false;
  return true;
}

function defaultGraphClient(cabinet_id: string): GraphAttachmentSource {
  return new MicrosoftGraphClient(cabinet_id, { acteur: { type: "systeme", id: null } });
}

/**
 * Traite UN email brut : télécharge ses pièces jointes ingérables et les classe.
 * Retourne le statut final + le nombre de documents créés. Ne lève pas.
 */
async function traiterEmail(
  row: { id: string; cabinet_id: string; message_id: string; has_attachments: boolean },
  makeGraph: () => GraphAttachmentSource,
  ingest: (input: IngestDocumentInput) => Promise<IngestDocumentResult>,
): Promise<{ statut: "traite" | "ignore" | "erreur"; documents: number }> {
  // Pas de pièce jointe → rien à classer (et on n'instancie même pas le client Graph).
  if (!row.has_attachments) return { statut: "ignore", documents: 0 };

  const graph = makeGraph();
  let attachments: AttachmentMeta[];
  try {
    attachments = await graph.listAttachments(row.message_id);
  } catch (err) {
    logger.error(
      {
        cabinet_id: row.cabinet_id,
        email_brut_id: row.id,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      "[process-emails] listAttachments échoué",
    );
    return { statut: "erreur", documents: 0 };
  }

  const fichiers = attachments.filter(estDocumentIngerable);
  if (fichiers.length === 0) return { statut: "ignore", documents: 0 };

  let documents = 0;
  for (const att of fichiers) {
    try {
      const bytes = await graph.downloadAttachment(row.message_id, att.id);
      const res = await ingest({
        cabinet_id: row.cabinet_id,
        bytes,
        nom_fichier: att.name ?? `piece-jointe-${att.id.slice(0, 8)}`,
        type_mime: att.contentType ?? "application/octet-stream",
        taille_octets: att.size ?? bytes.length,
        source: "email_microsoft",
        // Trace email ↔ document (mig 0050) — affichée dans le hub Documents.
        email_brut_id: row.id,
        // Rattachement client laissé à l'IA (email transféré possible) — pas de client forcé.
      });
      if (res.status === "recu" || res.status === "doublon") documents++;
    } catch (err) {
      logger.error(
        {
          cabinet_id: row.cabinet_id,
          email_brut_id: row.id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[process-emails] ingestion pièce jointe échouée",
      );
      return { statut: "erreur", documents };
    }
  }
  return { statut: "traite", documents };
}

/**
 * Traite les emails `recu` en attente (toutes cabinets, ou un seul si fourni). Idempotent.
 */
export async function processPendingEmails(
  opts: { cabinet_id?: string; limit?: number; deps?: ProcessEmailsDeps } = {},
): Promise<ProcessEmailsResult> {
  const makeClient = opts.deps?.makeGraphClient ?? defaultGraphClient;
  const ingest = opts.deps?.ingest ?? ingestDocumentBytes;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const rows = await db
    .select({
      id: emailBrut.id,
      cabinet_id: emailBrut.cabinet_id,
      message_id: emailBrut.message_id,
      has_attachments: emailBrut.has_attachments,
    })
    .from(emailBrut)
    .where(
      opts.cabinet_id
        ? and(eq(emailBrut.statut, "recu"), eq(emailBrut.cabinet_id, opts.cabinet_id))
        : eq(emailBrut.statut, "recu"),
    )
    .orderBy(asc(emailBrut.received_at))
    .limit(limit);

  const result: ProcessEmailsResult = { traite: 0, ignore: 0, erreur: 0, documents: 0 };
  for (const row of rows) {
    const { statut, documents } = await traiterEmail(row, () => makeClient(row.cabinet_id), ingest);
    result.documents += documents;
    result[statut] += 1;
    await db
      .update(emailBrut)
      .set({
        statut,
        traite_at: new Date(),
        ...(statut === "erreur" ? {} : { erreur: null }),
        updated_at: new Date(),
      })
      .where(and(eq(emailBrut.id, row.id), eq(emailBrut.cabinet_id, row.cabinet_id)));
  }
  return result;
}
