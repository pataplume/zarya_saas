import { db } from "@zarya/db";
import {
  type IndexDocumentInput,
  type IndexDocumentResult,
  indexDocument,
} from "@zarya/extraction";
import { logger } from "@zarya/logger";
import { sql } from "drizzle-orm";

// Backfill d'indexation RAG : indexe les doc.document VALIDÉS qui ont un texte OCR mais ne
// sont pas encore dans search.document_chunk (validés avant l'activation de l'indexation, ou
// embeddings indisponibles au moment de la validation). Sans ça, la recherche ne couvre que
// les documents validés DEPUIS le passage en live. Idempotent (NOT EXISTS sur les chunks).
// indexDocument s'auto-désactive si IK_MODEL_EMBEDDINGS absent (reason embeddings_non_configure).

interface PendingDocRow {
  document_id: string;
  cabinet_id: string;
  client_id: string | null;
  type: string | null;
  categorie: string | null;
  periode: string | null;
  ocr_text: string;
}

export interface IndexPendingResult {
  indexes: number;
  ignores: number;
  chunks: number;
}

export interface IndexPendingDeps {
  /** Cœur d'indexation (défaut : indexDocument). Injectable pour tests. */
  index?: (input: IndexDocumentInput) => Promise<IndexDocumentResult>;
}

export async function indexPendingDocuments(
  opts: { cabinet_id?: string; limit?: number; deps?: IndexPendingDeps } = {},
): Promise<IndexPendingResult> {
  const limit = opts.limit ?? 50;
  const index = opts.deps?.index ?? indexDocument;

  const rows = (await db.execute(sql`
    SELECT d.id AS document_id, d.cabinet_id, d.client_id,
           d.type, d.categorie::text AS categorie, d.periode, fp.ocr_text
    FROM doc.document d
    JOIN doc.fichier_physique fp ON fp.id = d.fichier_physique_id
    WHERE d.archived_at IS NULL
      AND fp.ocr_text IS NOT NULL AND length(btrim(fp.ocr_text)) > 0
      AND ${opts.cabinet_id ? sql`d.cabinet_id = ${opts.cabinet_id}` : sql`true`}
      AND NOT EXISTS (
        SELECT 1 FROM search.document_chunk sc WHERE sc.document_id = d.id
      )
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `)) as unknown as PendingDocRow[];

  const result: IndexPendingResult = { indexes: 0, ignores: 0, chunks: 0 };
  for (const row of rows) {
    try {
      const res = await index({
        cabinet_id: row.cabinet_id,
        document_id: row.document_id,
        client_id: row.client_id,
        text: row.ocr_text,
        document_type: row.type,
        document_periode: row.periode,
        document_categorie: row.categorie,
      });
      if (res.indexed) {
        result.indexes += 1;
        result.chunks += res.nb_chunks;
      } else {
        result.ignores += 1;
      }
    } catch (err) {
      result.ignores += 1;
      logger.error(
        {
          cabinet_id: row.cabinet_id,
          document_id: row.document_id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[index-pending] indexation échouée",
      );
    }
  }
  return result;
}
