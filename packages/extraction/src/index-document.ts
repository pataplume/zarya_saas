// H2b — Pipeline d'indexation RAG : découpe un document, calcule les embeddings (Infomaniak,
// catégorie `embeddings`) et range les chunks dans search.document_chunk. Réf : search.md §4.2 ;
// ADR 0022 (bge_multilingual_gemma2, halfvec 3584). Trace l'appel dans extraction.invocation.
//
// Re-indexation IDEMPOTENTE : les anciens chunks du document sont supprimés puis recréés dans une
// transaction. Les embeddings sont calculés AVANT la transaction : un échec laisse l'index existant
// intact. Gated : si la catégorie `embeddings` n'est pas configurée, on n'indexe pas (no-op) —
// sûr pour CI / environnements sans embeddings. Passages embeddés SANS préfixe d'instruction
// (le préfixe BGE est réservé aux REQUÊTES — ADR 0022, appliqué en H3).

import { db, invocation, sql } from "@zarya/db";
import { infomaniakClient } from "@zarya/integrations";
import { chunkText } from "./chunk-text";

export const SEARCH_INDEX_VERSION = "search-index-v1";
const EMBED_BATCH = 32;

/** Sous-ensemble du client Infomaniak requis pour l'indexation (injectable en test). */
export interface EmbeddingsClient {
  resolveModel(category: "embeddings"): Promise<string>;
  embeddings(params: { model: string; input: string[] }): Promise<{
    data: Array<{ index?: number; embedding: number[] }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  }>;
}

export interface IndexDocumentInput {
  cabinet_id: string;
  document_id: string;
  client_id?: string | null;
  /** Texte du document (natif ou OCRisé). */
  text: string;
  document_type?: string | null;
  document_periode?: string | null;
  document_categorie?: string | null;
  invoked_by_user_id?: string | null;
}

export interface IndexDocumentResult {
  indexed: boolean;
  nb_chunks: number;
  model?: string;
  reason?: "no_text" | "embeddings_non_configure";
}

/**
 * Indexe (ou ré-indexe) un document dans search.document_chunk. Best-effort par nature :
 * l'appelant (hook finaliserDocument) capture les erreurs sans casser la finalisation.
 */
export async function indexDocument(
  input: IndexDocumentInput,
  opts: { client?: EmbeddingsClient } = {},
): Promise<IndexDocumentResult> {
  const client = opts.client ?? (infomaniakClient as unknown as EmbeddingsClient);

  const chunks = chunkText(input.text ?? "");
  if (chunks.length === 0) return { indexed: false, nb_chunks: 0, reason: "no_text" };

  let model: string;
  try {
    model = await client.resolveModel("embeddings");
  } catch {
    // Catégorie embeddings non configurée → indexation désactivée (no-op, non bloquant).
    return { indexed: false, nb_chunks: 0, reason: "embeddings_non_configure" };
  }

  // 1. Embeddings par lot (passages bruts, sans préfixe d'instruction). AVANT toute écriture DB.
  const start = Date.now();
  const vectors: number[][] = [];
  let tokensInput = 0;
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const res = await client.embeddings({ model, input: batch });
      const ordered = [...res.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      for (const d of ordered) vectors.push(d.embedding);
      tokensInput += res.usage?.prompt_tokens ?? res.usage?.total_tokens ?? 0;
    }
  } catch (err) {
    await traceInvocation(input, model, 0, Date.now() - start, "unknown_error");
    throw err;
  }
  if (vectors.length !== chunks.length) {
    await traceInvocation(input, model, tokensInput, Date.now() - start, "unknown_error");
    throw new Error(
      `Indexation : ${vectors.length} embeddings pour ${chunks.length} chunks (incohérence).`,
    );
  }

  // 2. Re-indexation atomique : purge + insertion.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`DELETE FROM search.document_chunk
          WHERE document_id = ${input.document_id} AND cabinet_id = ${input.cabinet_id}`,
    );
    for (let i = 0; i < chunks.length; i++) {
      const literal = `[${(vectors[i] ?? []).join(",")}]`;
      await tx.execute(sql`
        INSERT INTO search.document_chunk
          (cabinet_id, document_id, client_id, chunk_index, text_content, embedding,
           embedding_model, document_type, document_periode, document_categorie)
        VALUES (
          ${input.cabinet_id}, ${input.document_id}, ${input.client_id ?? null}, ${i},
          ${chunks[i] ?? ""}, ${literal}::halfvec, ${model},
          ${input.document_type ?? null}, ${input.document_periode ?? null},
          ${input.document_categorie ?? null}
        )`);
    }
  });

  // 3. Traçabilité (audit + facturation à l'usage).
  await traceInvocation(input, model, tokensInput, Date.now() - start, "success", chunks.length);

  return { indexed: true, nb_chunks: chunks.length, model };
}

async function traceInvocation(
  input: IndexDocumentInput,
  model: string,
  tokensInput: number,
  durationMs: number,
  status: "success" | "unknown_error",
  nbChunks = 0,
): Promise<void> {
  await db.insert(invocation).values({
    cabinet_id: input.cabinet_id,
    context: "autre",
    invoked_by_module: "search",
    invoked_by_user_id: input.invoked_by_user_id ?? null,
    input_type: "text",
    input_document_id: input.document_id,
    model_used: model,
    prompt_version: SEARCH_INDEX_VERSION,
    status,
    nb_items_extracted: nbChunks,
    total_duration_ms: durationMs,
    tokens_input: tokensInput,
    tokens_output: 0,
    cost_usd: "0",
  });
}
