export {
  type MicrosoftGraphActeur,
  MicrosoftGraphClient,
  type MicrosoftGraphClientOptions,
} from "./client";
export type { MicrosoftErrorCode } from "./errors";
export { MicrosoftGraphError } from "./errors";
export type {
  CalendarEvent,
  CreateEventParams,
  EmailDetail,
  EmailFilter,
  EmailSummary,
  EventFilter,
  SendEmailParams,
} from "./graph-types";
export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getMicrosoftOAuthConfig,
  isAccessTokenExpiring,
  MICROSOFT_SCOPES,
  REFRESH_MARGIN_MS,
  refreshAccessToken,
} from "./oauth";
export {
  classifyTenantRegion,
  type TenantRegionSignal,
  type TenantRegionSource,
  type TenantRegionVerdict,
} from "./region";
export { signOAuthState, verifyOAuthState } from "./state";
export {
  type DetectTenantRegionOptions,
  detectAndPersistTenantRegion,
  type TenantRegionResult,
} from "./tenant-region";
export {
  acknowledgeTenantRegion,
  getValidMicrosoftAccessToken,
  type LoadedMicrosoftTokens,
  loadMicrosoftTokens,
  saveMicrosoftTokens,
  saveTenantRegionVerdict,
} from "./token-store";
export type {
  MicrosoftIntegrationParams,
  MicrosoftOAuthConfig,
  MicrosoftOAuthStatePayload,
  MicrosoftTokenResponse,
  MicrosoftTokenSet,
} from "./types";
