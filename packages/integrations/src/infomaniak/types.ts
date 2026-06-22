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

// Parties de contenu multimodal (format OpenAI). Utilisé pour la VISION/OCR :
// un message `user` peut mêler texte et image(s). L'image passe en data URL base64
// (`data:image/jpeg;base64,...`) — souveraineté CH : l'image n'est lue que par IK.
export type IkChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// Message de REQUÊTE : contenu string (cas courant) OU parties multimodales (vision).
export interface IkChatMessage {
  role: IkChatRole;
  content: string | IkChatContentPart[];
}

// Message de RÉPONSE : l'assistant renvoie toujours du texte (content string).
export interface IkChatResponseMessage {
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
  /**
   * Kwargs passés au template de chat du modèle (vLLM, IK Beta). Usage clé :
   * `{ enable_thinking: false }` désactive la trace de raisonnement des modèles « reasoning »
   * (ex. Qwen3.5) → extraction structurée bien plus rapide (~1s vs ~50s) et fiable (le « thinking »
   * ne mange plus le budget de tokens, plus de timeout). Ignoré par les modèles sans thinking.
   */
  chat_template_kwargs?: Record<string, unknown>;
}

export interface IkChatChoice {
  index: number;
  message: IkChatResponseMessage;
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

// ─── Embeddings (POST /v1/embeddings, OpenAI-compatible) ─────────────────────
export interface IkEmbeddingsParams {
  model: string;
  /** Un texte ou un lot de textes (batch). */
  input: string | string[];
}

export interface IkEmbeddingData {
  index: number;
  embedding: number[];
}

export interface IkEmbeddingsResponse {
  model: string;
  data: IkEmbeddingData[];
  usage?: IkUsage;
}

// Catégories logiques de tâches → un id réel est résolu par catégorie au runtime
// (jamais par nom de modèle codé en dur). Mapping via env IK_MODEL_<CATEGORY>.
export type ModelCategory = "chat_small" | "chat_large" | "vision" | "embeddings" | "reranker";
