// H3b — Détection d'intent d'une question de recherche (catégorie chat_small). Réf : search.md §6.1.
// Aiguille le pipeline RAG : `factuelle`/`recherche`/`synthese` → récupération de passages ;
// `agregation` → templates d'agrégation paramétrés (jamais de SQL libre) ; `hors_scope` → refus poli.
// Injectable (tests). Fallback robuste : toute erreur LLM → `recherche` (le RAG reste fonctionnel).

import { infomaniakClient } from "@zarya/integrations";
import type { ChatModelClient } from "./infomaniak-classifier";

export const SEARCH_INTENTS = [
  "factuelle",
  "recherche",
  "agregation",
  "synthese",
  "hors_scope",
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const INTENT_PROMPT_VERSION = "search-intent-v1";

const INTENT_SYSTEM_PROMPT =
  "Tu classes l'INTENTION d'une question posée par un fiduciaire sur ses documents comptables/RH. " +
  "Catégories : 'factuelle' (un fait précis dans un document), 'recherche' (retrouver des documents/passages), " +
  "'agregation' (un calcul/comptage : combien, total, somme), 'synthese' (résumer plusieurs sources), " +
  "'hors_scope' (sans rapport avec les documents du cabinet). Réponds en JSON {\"intent\": <catégorie>}.";

const INTENT_JSON_SCHEMA = {
  name: "search_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { intent: { type: "string", enum: [...SEARCH_INTENTS] } },
    required: ["intent"],
  },
} as const;

function coerceIntent(value: unknown): SearchIntent | null {
  return typeof value === "string" && (SEARCH_INTENTS as readonly string[]).includes(value)
    ? (value as SearchIntent)
    : null;
}

/**
 * Détecte l'intent d'une question. Ne lève jamais : en cas d'échec LLM / sortie invalide, retombe
 * sur `recherche` (récupération sémantique) pour rester utilisable.
 */
export async function detectIntent(
  question: string,
  opts: { client?: ChatModelClient } = {},
): Promise<{ intent: SearchIntent }> {
  const client = opts.client ?? infomaniakClient;
  try {
    const model = await client.resolveModel("chat_small");
    const res = await client.chatCompletion({
      model,
      temperature: 0,
      max_tokens: 32,
      response_format: { type: "json_schema", json_schema: INTENT_JSON_SCHEMA },
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { intent?: unknown };
    return { intent: coerceIntent(parsed.intent) ?? "recherche" };
  } catch {
    return { intent: "recherche" };
  }
}
