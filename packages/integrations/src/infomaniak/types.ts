// Types pour l'API Infomaniak AI Services (OpenAI-compatible, Beta).
// Base : https://api.infomaniak.com/2/ai/{product_id}/openai/v1
//
// ⚠️ Catalogue Beta : aucun model_id n'est codé en dur. Les ids réels sont lus
// au runtime via GET /v1/models (cf. ADR 0010). Ces types restent volontairement
// permissifs (champs optionnels) pour absorber les variations du catalogue Beta.

// Un modèle tel que retourné par GET /v1/models (forme OpenAI : { object, data[] }).
export interface IkModel {
  id: string;
  object?: string;
  owned_by?: string;
  created?: number;
}

export interface IkModelsResponse {
  object?: string;
  data: IkModel[];
}

export type IkChatRole = "system" | "user" | "assistant";

export interface IkChatMessage {
  role: IkChatRole;
  content: string;
}

// response_format — VÉRIFIÉ via sonde (2026-05-29) :
//  - `json_object` est REJETÉ par l'API Infomaniak ("no longer supported").
//  - `json_schema` (structured outputs) est supporté et renvoie un JSON conforme.
// On expose donc json_schema (chemin privilégié) et text. Le classifier garde
// néanmoins un fallback de parsing si un modèle refusait json_schema (Beta).
export interface IkJsonSchema {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

export type IkResponseFormat =
  | { type: "text" }
  | { type: "json_schema"; json_schema: IkJsonSchema };

export interface IkChatCompletionParams {
  model: string;
  messages: IkChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: IkResponseFormat;
}

export interface IkChatChoice {
  index: number;
  message: IkChatMessage;
  finish_reason: string | null;
}

export interface IkUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface IkChatCompletionResponse {
  id?: string;
  model: string;
  choices: IkChatChoice[];
  usage?: IkUsage;
}

// Catégories logiques de tâches → un id réel est résolu par catégorie au runtime
// (jamais par nom de modèle codé en dur). Mapping via env IK_MODEL_<CATEGORY>.
export type ModelCategory = "chat_small" | "chat_large" | "vision" | "embeddings" | "reranker";
