// Erreur typée pour l'intégration Microsoft Graph (CLAUDE.md integrations §3).
export type MicrosoftErrorCode =
  | "config_missing" // env serveur (MS_CLIENT_ID/SECRET/REDIRECT_URI) absent
  | "oauth_exchange" // échec échange code → tokens
  | "oauth_refresh" // échec refresh token
  | "state_invalid" // state OAuth absent / signature invalide (anti-CSRF)
  | "not_connected" // aucune intégration active pour ce cabinet
  | "revoked" // refresh_token révoqué côté Microsoft (401/invalid_grant)
  | "api_error";

export class MicrosoftGraphError extends Error {
  constructor(
    public readonly code: MicrosoftErrorCode,
    message: string,
    // Nommé `originalCause` pour éviter le conflit avec Error.cause (ES2022+).
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = "MicrosoftGraphError";
  }
}
