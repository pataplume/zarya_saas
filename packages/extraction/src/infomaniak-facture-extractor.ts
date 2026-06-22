// Extracteur facture "live" : Infomaniak AI Services (catégorie chat_large) — souveraineté
// suisse (ADR 0010). Calque InfomaniakClassifier : json_schema privilégié, fallback x1 sans
// response_format + consigne renforcée, parse tolérant, validation déterministe en aval.
//
// QR-first : la fusion des données de paiement depuis le QR-bill est portée par
// toFactureProposal (extract-facture.ts) — l'IA n'a pas à transcrire l'IBAN/montant quand
// le QR les fournit.

import {
  type IkChatCompletionParams,
  type IkChatCompletionResponse,
  InfomaniakError,
  infomaniakClient,
  type ModelCategory,
} from "@zarya/integrations";
import { ExtractionError } from "./classifier";
import {
  type FactureExtractionInput,
  type FactureExtractionResult,
  type FactureExtractor,
  type FactureProposal,
  toFactureProposal,
} from "./extract-facture";
import {
  buildUserPrompt,
  FACTURE_JSON_SCHEMA,
  FACTURE_PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./prompts/facture";

// Sous-ensemble du client Infomaniak nécessaire (injectable en test).
export interface ChatModelClient {
  resolveModel(category: ModelCategory): Promise<string>;
  chatCompletion(params: IkChatCompletionParams): Promise<IkChatCompletionResponse>;
}

// Le raisonnement du modèle est DÉSACTIVÉ (THINKING_OFF) : la sortie n'est plus que le JSON de la
// facture extraite (~20 champs). 2048 tokens suffisent très largement.
const MAX_TOKENS = 2048;

// La catégorie chat_large peut être servie par un modèle « reasoning » (ex. Qwen3.5) qui, par
// défaut, émet une LONGUE trace de raisonnement avant le JSON : elle mange tout le budget de
// tokens (sortie tronquée → JSON inexploitable) ET dépasse le timeout réseau (~50s). On désactive
// donc le « thinking » via le template du modèle → extraction directe (~1s, mesuré). Ignoré par
// un modèle sans thinking (no-op), donc sans risque si chat_large change de modèle.
const THINKING_OFF = { enable_thinking: false } as const;

function parseJsonLenient(content: string | undefined | null): unknown {
  if (!content) return null;
  let txt = content.trim();
  txt = txt
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(txt);
  } catch {
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(txt.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapInfomaniakError(err: unknown): ExtractionError {
  if (err instanceof InfomaniakError) {
    if (err.code === "timeout") return new ExtractionError("TIMEOUT", err.message, err);
    if (err.code === "rate_limit") return new ExtractionError("RATE_LIMIT", err.message, err);
    if (err.code === "config") return new ExtractionError("CONFIG", err.message, err);
    return new ExtractionError("LLM_ERROR", err.message, err);
  }
  return new ExtractionError("LLM_ERROR", "Échec de l'appel Infomaniak.", err);
}

export class InfomaniakFactureExtractor implements FactureExtractor {
  readonly mode = "live" as const;

  constructor(private readonly client: ChatModelClient = infomaniakClient) {}

  async extract(input: FactureExtractionInput): Promise<FactureExtractionResult> {
    const start = Date.now();

    let model: string;
    try {
      model = await this.client.resolveModel("chat_large");
    } catch (err) {
      throw mapInfomaniakError(err);
    }

    const baseMessages: IkChatCompletionParams["messages"] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ];

    // Tentative 1 : json_schema (sortie structurée garantie).
    let response = await this.callChat({
      model,
      temperature: 0,
      max_tokens: MAX_TOKENS,
      messages: baseMessages,
      response_format: { type: "json_schema", json_schema: FACTURE_JSON_SCHEMA },
      chat_template_kwargs: THINKING_OFF,
    }).catch((err) => err);

    let usedFallback = false;
    let proposal: FactureProposal | null = null;

    if (response instanceof Error) {
      if (!(response instanceof ExtractionError) || response.code === "LLM_ERROR") {
        usedFallback = true;
      } else {
        throw response; // timeout / rate_limit / config : pas de fallback utile
      }
    } else {
      proposal = toFactureProposal(parseJsonLenient(response.choices[0]?.message?.content), input);
      if (!proposal) usedFallback = true;
    }

    // Tentative 2 (fallback) : sans response_format, consigne de format renforcée.
    // ⚠️ Le message système DOIT rester EN TÊTE : certains modèles IK (ex. Qwen3.5) rejettent
    // un message système placé après le message utilisateur (« System message must be at the
    // beginning » → HTTP 400). On FUSIONNE donc la consigne renforcée dans le prompt système.
    if (usedFallback) {
      const reinforced: IkChatCompletionParams["messages"] = [
        {
          role: "system",
          content:
            `${SYSTEM_PROMPT}\n\n` +
            "RAPPEL STRICT : réponds par un UNIQUE objet JSON valide correspondant aux champs " +
            "demandés (fournisseur_*, numero_facture, date_emission, date_echeance, reference, " +
            "devise, total_ht, total_tva, total_ttc, montant_a_payer, taux_tva_principal, " +
            "categorie_comptable, confiance_globale, confiance_fournisseur, confiance_montants, " +
            "anomalies). Aucun texte hors du JSON.",
        },
        { role: "user", content: buildUserPrompt(input) },
      ];
      response = await this.callChat({
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        messages: reinforced,
        chat_template_kwargs: THINKING_OFF,
      });
      proposal = toFactureProposal(parseJsonLenient(response.choices[0]?.message?.content), input);
    }

    if (!proposal || response instanceof Error) {
      throw new ExtractionError(
        "VALIDATION_FAILED",
        "Réponse Infomaniak inexploitable (JSON invalide ou champs manquants).",
      );
    }

    const usage = response.usage;
    return {
      proposal,
      model_used: model,
      prompt_version: FACTURE_PROMPT_VERSION,
      duration_ms: Date.now() - start,
      raw_output: response,
      ...(usage
        ? {
            usage: {
              tokens_input: usage.prompt_tokens ?? 0,
              tokens_output: usage.completion_tokens ?? 0,
            },
          }
        : {}),
    };
  }

  private async callChat(params: IkChatCompletionParams): Promise<IkChatCompletionResponse> {
    try {
      return await this.client.chatCompletion(params);
    } catch (err) {
      throw mapInfomaniakError(err);
    }
  }
}
