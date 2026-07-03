// H3a — Récupération hybride pour le RAG : recherche vectorielle (pgvector cosinus top-K) +
// full-text (tsvector français), fusionnées par RRF. Réf : search.md §6.2 ; ADR 0022.
// Toujours scopée `cabinet_id` (RLS contournée par le service role → filtre discipliné +
// vérification applicative REDONDANTE avant de retourner — exigence H5/ADR 0005 addendum).

import { db, sql } from "@zarya/db";
import { infomaniakClient } from "@zarya/integrations";
import type { EmbeddingsClient } from "./index-document";
import { reciprocalRankFusion } from "./rrf";

// Préfixe d'instruction OBLIGATOIRE sur les REQUÊTES bge_multilingual_gemma2 (jamais sur les
// passages indexés). Sans lui, la récupération s'effondre (benchmark 03/06 : 2/6 → 6/6). ADR 0022.
export const BGE_QUERY_INSTRUCTION =
  "<instruct>Given a question, retrieve passages from accounting/HR documents that answer it\n<query>";

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  client_id: string | null;
  text_content: string;
  /** Score de fusion RRF (décroissant). */
  score: number;
}

export interface RetrieveInput {
  cabinet_id: string;
  question: string;
  /** Restreint la recherche à un client (optionnel). */
  client_id?: string | null;
  /** Nombre de candidats par modalité et de résultats finaux. Défaut 10. */
  topK?: number;
}

/**
 * Récupère les chunks les plus pertinents pour `question`, par fusion RRF de la recherche
 * vectorielle (si embeddings configurés) et full-text. Strictement scopée cabinet. Si les
 * embeddings ne sont pas configurés, retombe sur le full-text seul (récupération dégradée).
 */
export async function retrieveChunks(
  input: RetrieveInput,
  opts: { client?: EmbeddingsClient } = {},
): Promise<RetrievedChunk[]> {
  const topK = input.topK ?? 10;
  const client = opts.client ?? (infomaniakClient as unknown as EmbeddingsClient);
  const clientFilter = input.client_id ? sql`AND client_id = ${input.client_id}` : sql``;
  // Un document archivé (retiré volontairement : mal classé / doublon — archiverDocumentAction)
  // ne doit plus être servi comme source RAG ni au LLM. L'archivage ne désindexe pas les chunks
  // (pas de trigger) : on filtre donc au read, comme le font déjà hub/dossier/dashboard. Scopé
  // cabinet (les ids sont des UUID globalement uniques, le scope reste une défense en profondeur).
  const nonArchive = sql`AND document_id NOT IN (
    SELECT id FROM doc.document WHERE cabinet_id = ${input.cabinet_id} AND archived_at IS NOT NULL
  )`;

  type ChunkRow = {
    id: string;
    document_id: string;
    client_id: string | null;
    text_content: string;
    cabinet_id: string;
  };
  const byId = new Map<string, ChunkRow>();

  // 1. Liste vectorielle (cosinus) — requête embeddée AVEC le préfixe d'instruction BGE.
  let vectorIds: string[] = [];
  try {
    const model = await client.resolveModel("embeddings");
    const res = await client.embeddings({
      model,
      input: [`${BGE_QUERY_INSTRUCTION}${input.question}`],
    });
    const vec = res.data[0]?.embedding;
    if (vec && vec.length > 0) {
      const literal = `[${vec.join(",")}]`;
      const rows = (await db.execute(sql`
        SELECT id, document_id, client_id, text_content, cabinet_id FROM search.document_chunk
        WHERE cabinet_id = ${input.cabinet_id} AND embedding IS NOT NULL ${clientFilter} ${nonArchive}
        ORDER BY embedding <=> ${literal}::halfvec
        LIMIT ${topK}
      `)) as unknown as ChunkRow[];
      for (const r of rows) byId.set(r.id, r);
      vectorIds = rows.map((r) => r.id);
    }
  } catch {
    // Embeddings non configurés / indisponibles → full-text seul (non bloquant).
    vectorIds = [];
  }

  // 2. Liste full-text (tsvector français).
  const lexRows = (await db.execute(sql`
    SELECT id, document_id, client_id, text_content, cabinet_id FROM search.document_chunk
    WHERE cabinet_id = ${input.cabinet_id}
      AND text_tsvector @@ plainto_tsquery('french', ${input.question}) ${clientFilter} ${nonArchive}
    ORDER BY ts_rank(text_tsvector, plainto_tsquery('french', ${input.question})) DESC
    LIMIT ${topK}
  `)) as unknown as ChunkRow[];
  for (const r of lexRows) byId.set(r.id, r);
  const lexicalIds = lexRows.map((r) => r.id);

  // 3. Fusion RRF + troncature topK.
  const fused = reciprocalRankFusion([vectorIds, lexicalIds]).slice(0, topK);
  if (fused.length === 0) return [];

  const out: RetrievedChunk[] = [];
  for (const f of fused) {
    const row = byId.get(f.id);
    // Garde-fou : on ne retourne JAMAIS un chunk d'un autre cabinet (ne devrait pas arriver
    // vu le WHERE, mais on le vérifie explicitement avant tout usage downstream / prompt LLM).
    if (!row || row.cabinet_id !== input.cabinet_id) continue;
    out.push({
      chunk_id: row.id,
      document_id: row.document_id,
      client_id: row.client_id,
      text_content: row.text_content,
      score: f.score,
    });
  }
  return out;
}
