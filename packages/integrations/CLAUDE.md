# Instructions Claude Code — packages/integrations

## Contexte
Wrappers internes pour toutes les intégrations externes. Un sous-package par fournisseur.

## Structure
```
packages/integrations/
├── bedrock/                # AWS Bedrock (LLM)
├── microsoft/              # Microsoft Graph (email, calendar)
├── zefix/                  # Zefix (entreprises CH)
├── bexio/                  # Bexio API (compta + payroll)
├── mistral/                # Mistral OCR
├── nas/                    # NAS (SMB, WebDAV)
└── stripe/                 # Stripe (paiements)
```

## Pattern wrapper systématique

Chaque intégration suit le même pattern :

```typescript
// packages/integrations/bexio/client.ts
export class BexioClient {
  constructor(private cabinet_id: string) {
    // Charge les credentials du cabinet depuis crm.cabinet_integration
    // Décrypte via Supabase Vault
  }

  async findOrCreateContact(data: ContactData): Promise<{ id: number }> {...}
  async createBill(data: BillData): Promise<{ id: number }> {...}
  // ...
}
```

### Règles communes

1. **Toujours instancié avec `cabinet_id`** — pas de client global statique
2. **Credentials chargés depuis `crm.cabinet_integration`** chiffrés Vault
3. **Auto-refresh des tokens** OAuth quand applicable
4. **Retry avec backoff** pour erreurs réseau / rate limits
5. **Logging structuré** : chaque appel loggué avec latence, status
6. **Tests d'intégration** avec sandbox du fournisseur

## Règles non-négociables

### 1. Validation des credentials cabinet
- Vérifier que les credentials existent et sont actifs avant chaque appel
- Si expirés / révoqués : erreur claire pour l'utilisateur, notification cabinet

### 2. Audit des appels externes
- Tout appel API externe loggué dans `audit.api_externe`
- Contient : `cabinet_id`, `provider`, `endpoint`, `method`, `status_code`, `latency_ms`
- Permet de mesurer l'usage et de débugger les incidents

### 3. Gestion des erreurs typées
```typescript
class IntegrationError extends Error {
  constructor(
    public provider: 'bexio' | 'microsoft' | 'zefix' | 'mistral' | 'bedrock' | 'nas' | 'stripe',
    public code: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
  }
}
```

### 4. Pas d'exposition de données cabinet à un autre cabinet
- Même si bug, impossible que le client `BexioClient` du cabinet A appelle avec les credentials du cabinet B
- Vérification au constructor

### 5. Webhooks entrants
- Validation HMAC / signature systématique
- Identification du cabinet via `clientState` (Microsoft) ou metadata
- Idempotence : un même événement reçu 2x ne crée pas 2 effets
- Pas d'effet de bord avant validation complète

## Sous-package par sous-package

### `bedrock/`
- Référence ADR 0003
- Endpoint : `https://bedrock-runtime.eu-central-1.amazonaws.com`
- Modèles autorisés : Claude Sonnet 4.6, Haiku 4.5, Cohere Embed Multilingual, Titan Embeddings
- Auth : IAM role (pas de clés statiques en prod)
- Référence : `/docs/architecture/llm-strategy.md`

### `microsoft/`
- Microsoft Graph v1.0
- OAuth multi-tenant avec scopes minimaux
- Vérification région tenant à l'onboarding cabinet
- Webhooks subscriptions à renouveler avant expiration (job pg_cron)
- Référence : `/docs/architecture/microsoft-integration.md`

### `zefix/`
- API publique : https://www.zefix.ch/ZefixPublicREST/api/v1/
- Pas d'auth requise (rate limit IP)
- Cache 24h / 7j (selon type de query)
- Consentement nLPD explicite avant appel
- Fallback saisie manuelle si Zefix down
- Référence : `/docs/architecture/zefix-integration.md`

### `bexio/`
- API REST v2.0 et v3.0
- OAuth 2.0 par cabinet
- Rate limit ~30 req/sec par token
- Webhooks pour sync bidirectionnelle (Phase 2)
- Référence : `/docs/architecture/payroll-integration.md`

### `mistral/`
- API Mistral La Plateforme (eu-west-3 Paris)
- Endpoint OCR
- Auth : API key (stockée Vault, scope cabinet ZARYA pas par cabinet client)
- Pas de stockage long terme côté Mistral

### `nas/`
- Protocoles : SMB 3.x (priorité 1), WebDAV (priorité 2), SFTP (priorité 3)
- Pas de SMB 1.x (insecure)
- Pas de FTP
- Lecture seule au MVP (pattern A)
- Référence : `/docs/architecture/nas-ingestion.md`

### `stripe/`
- Stripe API v2023-10-16 ou plus récente
- Webhooks pour événements paiement
- Pas de carte stockée côté ZARYA
- Stripe Connect pas utilisé au MVP

## Patterns de tests

### Tests unitaires
- Mock du provider (vitest mock)
- Vérifier que les bons params sont passés
- Vérifier la gestion d'erreur

### Tests d'intégration (sandbox)
- Compte sandbox dédié pour chaque provider
- Tests CI optionnels (coûtent en quotas)
- Tests manuels avant chaque release majeure

## Ce que tu NE fais PAS

- Pas de SDK provider importé directement dans `apps/web` (toujours via wrapper)
- Pas de credentials en clair dans le code
- Pas de TLS skip / disable cert validation
- Pas de partage de tokens entre cabinets
- Pas d'appel synchrone bloquant (toujours async)
- Pas d'absence de timeout
- Pas de retry infini

## Référence documentation

- ADR 0003 — LLM Bedrock
- `/docs/architecture/microsoft-integration.md`
- `/docs/architecture/zefix-integration.md`
- `/docs/architecture/payroll-integration.md`
- `/docs/architecture/nas-ingestion.md`
- `/docs/architecture/security-and-audit.md` § 14
