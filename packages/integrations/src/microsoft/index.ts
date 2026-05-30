export type { MicrosoftErrorCode } from "./errors";
export { MicrosoftGraphError } from "./errors";
export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  isAccessTokenExpiring,
  MICROSOFT_SCOPES,
  REFRESH_MARGIN_MS,
  refreshAccessToken,
} from "./oauth";
export { signOAuthState, verifyOAuthState } from "./state";
export {
  getValidMicrosoftAccessToken,
  type LoadedMicrosoftTokens,
  loadMicrosoftTokens,
  saveMicrosoftTokens,
} from "./token-store";
export type {
  MicrosoftIntegrationParams,
  MicrosoftOAuthConfig,
  MicrosoftOAuthStatePayload,
  MicrosoftTokenResponse,
  MicrosoftTokenSet,
} from "./types";
