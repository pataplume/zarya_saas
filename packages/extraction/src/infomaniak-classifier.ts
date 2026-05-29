// Classifier "live" : appelle Infomaniak AI Services (catégorie chat_small) pour
// classer un document. Souveraineté suisse (ADR 0010).
//
// Robustesse Beta :
//  - chemin privilégié : response_format json_schema (sortie garantie conforme,
//    VÉRIFIÉ côté Infomaniak) ;
//  - fallback : si un modèle refuse json_schema (api_error) OU rend un JSON
//    invalide, on retente UNE fois sans response_format + consigne renforcée,
//    puis on parse de façon tolérante (cf. extraction/CLAUDE.md retry x1).
//  - validation déterministe applicative en aval (enum, bornes 0..1).

import {
  type IkChatCompletionParams,
  type IkChatCompletionResponse,
  InfomaniakError,
  infomaniakClient,
  type ModelCategory,
} from "@zarya/integrations";
import {
  type CategorieDocument,
  type ClassificationInput,
  type ClassificationProposal,
  type ClassificationResult,
  type Classifier,
  ExtractionError,
} from "./classifier";
import {
  buildUserPrompt,
  CATEGORIES,
  CLASSIFY_DOC_JSON_SCHEMA,
  CLASSIFY_DOC_PROMPT_VERSION,
  type ClassifyDocRaw,
  SYSTEM_PROMPT,
  TYPE_TO_CATEGORIE,
} from "./prompts/classification-doc";

// Sous-ensemble du client Infomaniak dont le classifier a besoin (injectable en test).
export interface ChatModelClient {
  resolveModel(category: ModelCategory): Promise<string>;
  chatCompletion(params: IkChatCompletionParams): Promise<IkChatCompletionResponse>;
}

const MAX_TOKENS = 512;
const CATEGORIE_SET = new Set<string>(CATEGORIES);

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

// Parse tolérant : enlève d'éventuelles clôtures markdown et isole le 1er objet JSON.
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

function libelleParDefaut(nom: string): string {
  const sansExt = nom.replace(/\.[a-z0-9]{1,8}$/i, "");
  return sansExt.replace(/[_-]+/g, " ").trim() || nom;
}

// Valide + normalise la sortie brute du modèle vers une ClassificationProposal sûre.
// Retourne null si la structure de base est inexploitable (déclenche le fallback/erreur).
function toProposal(raw: unknown, input: ClassificationInput): ClassificationProposal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<ClassifyDocRaw>;
  if (typeof r.type !== "string" || r.type.trim() === "") return null;
  const type = r.type.trim();

  // La catégorie est une fonction du type (invariant de la taxonomie, cf. prompt v2).
  // Si le type est connu, on dérive la catégorie côté code (le modèle ne peut pas
  // dévier). Sinon on retombe sur la catégorie du modèle si valide, sinon "autre".
  const categorie: CategorieDocument =
    TYPE_TO_CATEGORIE[type] ??
    (typeof r.categorie === "string" && CATEGORIE_SET.has(r.categorie)
      ? (r.categorie as CategorieDocument)
      : "autre");

  const libelle =
    typeof r.libelle === "string" && r.libelle.trim() !== ""
      ? r.libelle.trim()
      : libelleParDefaut(input.nom_fichier);

  const periode =
    typeof r.periode === "string" && r.periode.trim() !== "" ? r.periode.trim() : null;

  const anomalies = Array.isArray(r.anomalies)
    ? r.anomalies.filter((a): a is string => typeof a === "string")
    : [];

  return {
    type,
    categorie,
    libelle,
    periode,
    confiance_globale: clamp01(r.confiance_globale),
    confiance_par_champ: {
      type: clamp01(r.confiance_type),
      categorie: clamp01(r.confiance_categorie),
      periode: clamp01(r.confiance_periode),
    },
    anomalies,
  };
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

export class InfomaniakClassifier implements Classifier {
  readonly mode = "live" as const;

  constructor(private readonly client: ChatModelClient = infomaniakClient) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const start = Date.now();

    let model: string;
    try {
      model = await this.client.resolveModel("chat_small");
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
      response_format: { type: "json_schema", json_schema: CLASSIFY_DOC_JSON_SCHEMA },
    }).catch((err) => err);

    let usedFallback = false;
    let proposal: ClassificationProposal | null = null;

    if (response instanceof Error) {
      // json_schema refusé par ce modèle (Beta) → on bascule en fallback.
      if (!(response instanceof ExtractionError) || response.code === "LLM_ERROR") {
        usedFallback = true;
      } else {
        throw response; // timeout / rate_limit / config : pas de fallback utile
      }
    } else {
      proposal = toProposal(parseJsonLenient(response.choices[0]?.message?.content), input);
      if (!proposal) usedFallback = true;
    }

    // Tentative 2 (fallback) : sans response_format, consigne de format renforcée.
    if (usedFallback) {
      const reinforced: IkChatCompletionParams["messages"] = [
        ...baseMessages,
        {
          role: "system",
          content:
            "Réponds STRICTEMENT par un unique objet JSON valide correspondant aux champs " +
            "demandés (type, categorie, libelle, periode, confiance_globale, confiance_type, " +
            "confiance_categorie, confiance_periode, anomalies). Aucun texte hors du JSON.",
        },
      ];
      response = await this.callChat({
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        messages: reinforced,
      });
      proposal = toProposal(parseJsonLenient(response.choices[0]?.message?.content), input);
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
      prompt_version: CLASSIFY_DOC_PROMPT_VERSION,
      duration_ms: Date.now() - start,
      raw_output: response,
      ...(usage
        ? {
            usage: {
              tokens_input: usage.prompt_tokens ?? 0,
              tokens_output: usage.completion_tokens ?? 0,
              // Tarification Infomaniak non vérifiée à ce stade → coût laissé au pipeline.
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
