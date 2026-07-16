// H4b — Orchestration de la recherche conversationnelle (RAG) : intent → récupération → génération
// sourcée → persistance de la trace search.requete. Réf : search.md §6 ; KICKOFF H4. Strictement
// scopée cabinet (retrieveChunks). Robuste : un échec de génération renvoie quand même les passages.
// P0-4 (AUDIT-MVP §8) : intent `agregation` → templates paramétrés (réponse chiffrée déterministe,
// scopée cabinet) ; si aucun template ne matche → repli RAG textuel (comportement antérieur).

import { db, searchRequete } from "@zarya/db";
import { AggregationError, runAggregation } from "./aggregation-templates";
import { detectIntent, type SearchIntent } from "./detect-intent";
import { type AnswerSource, generateAnswer } from "./generate-answer";
import type { EmbeddingsClient } from "./index-document";
import type { ChatModelClient } from "./infomaniak-classifier";
import { retrieveChunks } from "./retrieve";
import { selectAggregationTemplate } from "./select-aggregation";

const HORS_SCOPE_MESSAGE =
  "Cette question semble sortir du périmètre des documents du cabinet. Je ne peux y répondre qu'à partir de vos documents.";
const GENERATION_INDISPONIBLE =
  "La génération de la réponse est momentanément indisponible. Voici les passages les plus pertinents trouvés.";

export interface AnswerQuestionInput {
  cabinet_id: string;
  question: string;
  utilisateur_id: string;
  client_id?: string | null;
  topK?: number;
}

export interface AnswerQuestionResult {
  requete_id: string | null;
  intent: SearchIntent;
  answer: string;
  sources: AnswerSource[];
  nb_chunks: number;
}

/**
 * Répond à une question sur les documents du cabinet : détecte l'intent, récupère les passages
 * pertinents (hybride, scopé cabinet), génère une réponse sourcée anti-injection, et persiste la
 * trace dans search.requete. Clients LLM/embeddings injectables (tests).
 */
export async function answerQuestion(
  input: AnswerQuestionInput,
  opts: { embClient?: EmbeddingsClient; chatClient?: ChatModelClient } = {},
): Promise<AnswerQuestionResult> {
  const start = Date.now();
  const { intent } = await detectIntent(input.question, {
    ...(opts.chatClient ? { client: opts.chatClient } : {}),
  });

  // Hors-scope : refus poli, pas de récupération ni de génération.
  if (intent === "hors_scope") {
    const requete_id = await persistRequete(
      input,
      intent,
      HORS_SCOPE_MESSAGE,
      [],
      0,
      Date.now() - start,
    );
    return { requete_id, intent, answer: HORS_SCOPE_MESSAGE, sources: [], nb_chunks: 0 };
  }

  // Agrégation (« combien / total ») : réponse chiffrée par requête paramétrée (jamais de SQL
  // libre, cabinet_id imposé) plutôt que RAG textuel potentiellement faux. Aucun match → RAG.
  if (intent === "agregation") {
    const answer = await tryAggregation(input, opts);
    if (answer !== null) {
      const requete_id = await persistRequete(input, intent, answer, [], 0, Date.now() - start);
      return { requete_id, intent, answer, sources: [], nb_chunks: 0 };
    }
  }

  const chunks = await retrieveChunks(
    {
      cabinet_id: input.cabinet_id,
      question: input.question,
      ...(input.client_id ? { client_id: input.client_id } : {}),
      ...(input.topK ? { topK: input.topK } : {}),
    },
    { ...(opts.embClient ? { client: opts.embClient } : {}) },
  );

  let answer: string;
  let sources: AnswerSource[];
  try {
    const gen = await generateAnswer(input.question, chunks, {
      ...(opts.chatClient ? { client: opts.chatClient } : {}),
    });
    answer = gen.answer;
    sources = gen.sources;
  } catch {
    // Génération LLM indisponible : on renvoie quand même les sources récupérées (dégradé).
    answer = GENERATION_INDISPONIBLE;
    sources = chunks.map((c, i) => ({
      n: i + 1,
      chunk_id: c.chunk_id,
      document_id: c.document_id,
    }));
  }

  const requete_id = await persistRequete(
    input,
    intent,
    answer,
    sources,
    chunks.length,
    Date.now() - start,
  );
  return { requete_id, intent, answer, sources, nb_chunks: chunks.length };
}

/**
 * Tente de répondre par un template d'agrégation paramétré (scopé cabinet). Retourne la réponse
 * chiffrée (avec mention de la source de calcul) ou null si aucun template ne matche / si les
 * paramètres sont refusés — l'appelant retombe alors sur le RAG textuel.
 */
async function tryAggregation(
  input: AnswerQuestionInput,
  opts: { chatClient?: ChatModelClient },
): Promise<string | null> {
  const selection = await selectAggregationTemplate(input.question, {
    ...(opts.chatClient ? { client: opts.chatClient } : {}),
  });
  if (!selection) return null;
  try {
    const res = await runAggregation({
      cabinet_id: input.cabinet_id,
      template_id: selection.template_id,
      params: selection.params,
    });
    return (
      `${res.answer}\n\n` +
      `Résultat calculé directement sur la base documentaire du cabinet ` +
      `(requête « ${res.template_id} »), sans génération par l'IA.`
    );
  } catch (err) {
    // Catch CIBLÉ : seuls les refus du moteur d'agrégation (template/paramètres invalides)
    // retombent sur le RAG. Toute autre erreur (ex. DB) remonte à l'appelant.
    if (err instanceof AggregationError) return null;
    throw err;
  }
}

async function persistRequete(
  input: AnswerQuestionInput,
  intent: SearchIntent,
  reponse: string,
  sources: AnswerSource[],
  nbChunks: number,
  durationMs: number,
): Promise<string | null> {
  const [row] = await db
    .insert(searchRequete)
    .values({
      cabinet_id: input.cabinet_id,
      utilisateur_id: input.utilisateur_id,
      question: input.question,
      intent_detecte: intent,
      nb_chunks_recuperes: nbChunks,
      nb_chunks_utilises: sources.length,
      duration_ms: durationMs,
      reponse_text: reponse,
      sources_citees: sources,
    })
    .returning({ id: searchRequete.id });
  return row?.id ?? null;
}
