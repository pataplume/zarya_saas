import { db, uploadBrut } from "@zarya/db";
import { classifyDocument } from "@zarya/extraction";
import { logger } from "@zarya/logger";
import { and, eq, sql } from "drizzle-orm";

// Reclassement des documents bloqués en `recu` : un upload dont la classification n'a jamais
// abouti (échec live config/quota avant le repli, ou ancien doc) reste 'recu' et INVISIBLE dans
// la file de validation. On le rejoue en réutilisant le texte OCR déjà stocké (pas de
// re-téléchargement). Idempotent : on ne traite que les uploads SANS proposition existante.

interface PendingRow {
  upload_id: string;
  cabinet_id: string;
  nom: string;
  type_mime: string | null;
  ocr_text: string | null;
  taille: number | null;
  client_id: string | null;
  fichier_id: string;
}

export interface ReprocessResult {
  reclasses: number;
  echecs: number;
}

export async function reprocessPendingDocuments(
  opts: { cabinet_id?: string; upload_brut_id?: string; limit?: number } = {},
): Promise<ReprocessResult> {
  const limit = opts.limit ?? 50;
  const rows = (await db.execute(sql`
    SELECT ub.id AS upload_id, ub.cabinet_id, ub.nom_fichier_original AS nom,
           ub.taille_octets AS taille, ub.client_id,
           fp.id AS fichier_id, fp.type_mime, fp.ocr_text
    FROM doc.upload_brut ub
    JOIN doc.fichier_physique fp ON fp.upload_brut_id = ub.id
    WHERE ub.statut = 'recu'
      AND ${opts.cabinet_id ? sql`ub.cabinet_id = ${opts.cabinet_id}` : sql`true`}
      AND ${opts.upload_brut_id ? sql`ub.id = ${opts.upload_brut_id}` : sql`true`}
      AND NOT EXISTS (
        SELECT 1 FROM doc.proposition_classement pc
        WHERE pc.fichier_physique_id = fp.id AND pc.cabinet_id = ub.cabinet_id
      )
    ORDER BY ub.date_upload ASC
    LIMIT ${limit}
  `)) as unknown as PendingRow[];

  const result: ReprocessResult = { reclasses: 0, echecs: 0 };
  for (const row of rows) {
    try {
      const classif = await classifyDocument({
        cabinet_id: row.cabinet_id,
        fichier_physique_id: row.fichier_id,
        nom_fichier: row.nom,
        ...(row.taille != null ? { taille_octets: row.taille } : {}),
        ...(row.type_mime ? { type_mime: row.type_mime } : {}),
        ocr_text: row.ocr_text,
        ...(row.client_id ? { client_id_connu: row.client_id } : {}),
      });
      await db
        .update(uploadBrut)
        .set({ statut: classif.auto_classe ? "valide" : "a_valider" })
        .where(and(eq(uploadBrut.id, row.upload_id), eq(uploadBrut.cabinet_id, row.cabinet_id)));
      result.reclasses += 1;
    } catch (err) {
      result.echecs += 1;
      logger.error(
        {
          cabinet_id: row.cabinet_id,
          upload_brut_id: row.upload_id,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
        "[reprocess-documents] reclassement échoué",
      );
    }
  }
  return result;
}
