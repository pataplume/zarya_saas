// @zarya/integrations — wrappers : Infomaniak AI (souveraineté CH), Zefix, …
// (Bedrock/Mistral retirés de la chaîne IA, cf. ADR 0010.)

export type {
  IkChatCompletionParams,
  IkChatCompletionResponse,
  IkChatContentPart,
  IkChatMessage,
  IkChatResponseMessage,
  IkChatRole,
  IkJsonSchema,
  IkModel,
  IkModelsResponse,
  IkResponseFormat,
  IkUsage,
  InfomaniakClientOptions,
  InfomaniakErrorCode,
  ModelCategory,
} from "./infomaniak";
export {
  InfomaniakClient,
  InfomaniakError,
  infomaniakClient,
} from "./infomaniak";
export type {
  MicrosoftErrorCode,
  MicrosoftIntegrationParams,
  MicrosoftOAuthConfig,
  MicrosoftOAuthStatePayload,
  MicrosoftTokenResponse,
  MicrosoftTokenSet,
} from "./microsoft";
export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  getValidMicrosoftAccessToken,
  isAccessTokenExpiring,
  loadMicrosoftTokens,
  MICROSOFT_SCOPES,
  MicrosoftGraphError,
  REFRESH_MARGIN_MS,
  refreshAccessToken,
  saveMicrosoftTokens,
  signOAuthState,
  verifyOAuthState,
} from "./microsoft";
export type { ZefixAddress, ZefixCompanyDetail, ZefixCompanySummary, ZefixResultat } from "./zefix";
export { ZefixClient, ZefixError, zefixClient } from "./zefix";
