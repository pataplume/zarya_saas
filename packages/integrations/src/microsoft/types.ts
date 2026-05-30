// Types de l'intégration Microsoft Graph (Bloc D1).

// Jeu de tokens OAuth, tel que stocké (chiffré) dans Supabase Vault.
// `expires_at` est calculé à la réception (now + expires_in) et sert au refresh
// proactif -5 min. Ces champs sont ULTRA-SENSIBLES : jamais loggés, jamais en clair
// hors Vault (ADR 0013 addendum).
export interface MicrosoftTokenSet {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_at: string; // ISO 8601
}

// Données NON sensibles d'une intégration, stockées en clair dans
// crm.cabinet_integration.parametres.
export interface MicrosoftIntegrationParams {
  tenant_id?: string;
  user_principal_name?: string;
  tenant_region?: string;
  scope?: string;
  expires_at?: string; // miroir non sensible pour requêtes/affichage
}

// Configuration OAuth, dérivée d'env serveur uniquement (jamais côté client).
export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  tenant: string; // 'common' | 'organizations' | <tenant-id>
  redirectUri: string;
  scopes: string[];
}

// Réponse brute du endpoint token Microsoft (champs utiles).
export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
  expires_in: number; // secondes
}

// Payload signé du paramètre `state` OAuth (anti-CSRF + liaison au cabinet).
export interface MicrosoftOAuthStatePayload {
  cabinet_id: string;
  nonce: string;
  iat: number; // epoch ms
}
