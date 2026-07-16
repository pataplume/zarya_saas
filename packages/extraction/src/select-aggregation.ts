// P0-4 (AUDIT-MVP §8) — Sélection d'un template d'agrégation pour une question « combien/total ».
// Le LLM (chat_small) choisit UNIQUEMENT un id du catalogue whitelisté + une année optionnelle ;
// il ne devine JAMAIS un client_id (aucun uuid inventé) et n'écrit JAMAIS de SQL. Les paramètres
// sont re-validés par runAggregation (défense en profondeur). Réf : search.md §6.2 ; KICKOFF H3.
// Ne lève jamais : tout échec / sortie invalide / « aucun » → null (l'appelant retombe sur le RAG).

import { infomaniakClient } from "@zarya/integrations";
import { aggregationCatalog } from "./aggregation-templates";
import type { ChatModelClient } from "./infomaniak-classifier";

export const SELECT_AGGREGATION_PROMPT_VERSION = "search-aggregation-select-v1";

// Garde-fou aligné sur le fix #177 (cf. infomaniak-facture-extractor.ts) : désactive la trace de
// raisonnement d'un modèle « reasoning » (content vide sinon). No-op pour un modèle sans thinking.
const THINKING_OFF = { enable_thinking: false } as const;

const AUCUN = "aucun";

export interface AggregationSelection {
  template_id: string;
  params: Record<string, unknown>;
}

function buildSystemPrompt(): string {
  const catalogue = aggregationCatalog()
    .map((t) => `- "${t.id}" : ${t.description}`)
    .join("\n");
  return (
    "Une question de fiduciaire demande un calcul/comptage sur ses documents. Choisis le template " +
    "de calcul qui y répond dans ce catalogue :\n" +
    `${catalogue}\n` +
    `Si aucun template ne répond à la question, réponds "${AUCUN}". ` +
    "Si la question mentionne une année précise, renseigne `annee`, sinon null. " +
    'Réponds en JSON {"template_id": <id ou "aucun">, "annee": <entier ou null>}.'
  );
}

function buildJsonSchema() {
  return {
    name: "aggregation_selection",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        template_id: {
          type: "string",
          enum: [...aggregationCatalog().map((t) => t.id), AUCUN],
        },
        annee: { type: ["integer", "null"] },
      },
      required: ["template_id", "annee"],
    },
  } as const;
}

/**
 * Sélectionne un template d'agrégation (whitelist) pour la question, ou null si aucun ne matche
 * (ou si le LLM échoue) — l'appelant retombe alors sur le RAG textuel. Les ids proposés au LLM
 * viennent du catalogue ; un id hors catalogue est rejeté ici (puis encore par runAggregation).
 */
export async function selectAggregationTemplate(
  question: string,
  opts: { client?: ChatModelClient } = {},
): Promise<AggregationSelection | null> {
  const client = opts.client ?? infomaniakClient;
  try {
    const model = await client.resolveModel("chat_small");
    const res = await client.chatCompletion({
      model,
      temperature: 0,
      max_tokens: 64,
      chat_template_kwargs: THINKING_OFF,
      response_format: { type: "json_schema", json_schema: buildJsonSchema() },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: question },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { template_id?: unknown; annee?: unknown };

    const ids = aggregationCatalog().map((t) => t.id);
    if (typeof parsed.template_id !== "string" || !ids.includes(parsed.template_id)) return null;

    const params: Record<string, unknown> = {};
    if (
      typeof parsed.annee === "number" &&
      Number.isInteger(parsed.annee) &&
      parsed.annee >= 2000 &&
      parsed.annee <= 2100
    ) {
      params.annee = parsed.annee;
    }
    return { template_id: parsed.template_id, params };
  } catch {
    // Échec LLM / JSON invalide : pas d'agrégation, le RAG reste fonctionnel.
    return null;
  }
}
