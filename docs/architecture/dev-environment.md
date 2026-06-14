---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: [stack, security-and-audit, llm-strategy, multi-tenant]
referenced_by: [stack, README]
---

# Environnement de développement

> Setup, conventions, et outils pour développer ZARYA. Ce document est le **point d'entrée** d'un nouveau développeur sur le projet.

## 1. Stack locale requise

### 1.1 Versions
- **Node.js** : 22 LTS (version exacte dans `.nvmrc`)
- **pnpm** : 9+ (préféré à npm/yarn pour le workspace)
- **Git** : 2.40+
- **Docker** : 24+ (pour Postgres local, optionnel)
- **Postgres** : 16+ (local via Docker ou via Supabase CLI)

### 1.2 OS supportés
- macOS (Apple Silicon ou Intel)
- Linux (Ubuntu, Debian, Arch)
- Windows via WSL2 uniquement

Pas de support natif Windows (trop de friction sur SMB, encodage, perms).

### 1.3 Éditeur recommandé
- **VS Code** avec extensions :
  - ESLint
  - Prettier (ou Biome)
  - Prisma (si Prisma utilisé)
  - Tailwind CSS IntelliSense
  - GitLens
  - Error Lens

## 2. Setup initial

### 2.1 Clone et installation
```bash
git clone git@github.com:zarya/zarya.git
cd zarya
nvm use            # Lit .nvmrc, installe Node 22
corepack enable    # Active pnpm
pnpm install
```

### 2.2 Variables d'environnement
Copier `.env.example` vers `.env.local` :
```bash
cp .env.example .env.local
```

Remplir avec les valeurs du **vault d'équipe** (1Password ou équivalent).

Variables critiques :
```
# Supabase local (via Supabase CLI)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>

# Infomaniak AI Services (souveraineté suisse, API OpenAI-compatible)
# Pas de model_id codé en dur : les modèles sont résolus au runtime via GET /v1/models,
# mappés par catégorie (chat_small / chat_large / embeddings / vision).
IK_PRODUCT_ID=<product id>
IK_API_TOKEN=<api token>
IK_MODEL_CHAT_SMALL=<catégorie chat_small, optionnel — override de la résolution runtime>
IK_MODEL_CHAT_LARGE=<catégorie chat_large, optionnel — override de la résolution runtime>

# Microsoft Graph (app multi-tenant ZARYA — ADR 0018). Noms alignés sur le code (MS_*).
MS_CLIENT_ID=<app multi-tenant ZARYA>
MS_CLIENT_SECRET=<client secret>
MS_REDIRECT_URI=<https://.../api/integrations/microsoft/callback>
MS_TENANT=common
# URL publique de l'app (sert à l'URL de notification webhook D4 + redirections)
NEXT_PUBLIC_APP_URL=<https://app...>
# Secret du cron de renouvellement des subscriptions (D4c, prod Vercel)
CRON_SECRET=<chaîne aléatoire>

# Stripe (test mode obligatoire en dev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Logs et monitoring
SENTRY_DSN=<dev dsn ou vide>
LOG_LEVEL=debug

# Features flags
FEATURE_SEARCH_ENABLED=false
```

### 2.3 Supabase local
Deux options :

**Option A — Supabase CLI (recommandé)**
```bash
brew install supabase/tap/supabase
supabase start
supabase migration up
supabase db seed
```

Avantages : reproduction fidèle de prod, RLS testable, Storage local.

**Option B — Postgres pur**
```bash
docker compose up -d postgres
pnpm migrate
pnpm seed
```

Moins fidèle (pas de RLS facilement testable, pas de Storage). À éviter.

### 2.4 Lancer l'app
```bash
pnpm dev
```

Disponible sur `http://localhost:3000`.

## 3. Structure du repo

```
zarya/
├── apps/
│   └── web/                       # App Next.js principale
│       ├── app/                   # Routes (App Router)
│       │   ├── (marketing)/       # Landing, pricing
│       │   ├── (app)/             # Dashboard fiduciaire + client
│       │   ├── api/               # API routes
│       │   └── auth/              # Auth flows
│       ├── components/            # Composants React
│       ├── lib/                   # Logique métier
│       └── public/                # Assets statiques
│
├── packages/                      # Libs partagées
│   ├── ui/                        # Composants shadcn/ui customisés
│   ├── schemas/                   # Schémas Zod partagés
│   ├── extraction/                # Pipeline IA
│   │   ├── prompts/              # Prompts versionnés par contexte
│   │   ├── client.ts             # API publique
│   │   └── types.ts
│   ├── integrations/
│   │   ├── infomaniak/
│   │   ├── microsoft/
│   │   ├── zefix/
│   │   ├── bexio/
│   │   └── nas/
│   ├── db/                        # Schéma Drizzle + migrations
│   │   ├── schema/               # Tables par schéma Postgres
│   │   ├── migrations/           # SQL généré
│   │   └── seed/                 # Données de seed (dev + tests)
│   ├── auth/                      # Helpers auth + RBAC
│   └── multi-tenant/              # Helpers cabinet resolution
│
├── docs/                          # Cette documentation
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/                       # Scripts ops, migrations, seeding
├── .github/
│   └── workflows/                # CI/CD
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

## 4. Environnements

### 4.1 Local
- DB : Supabase local (Docker)
- Infomaniak AI Services : token de dev (quota strict, modèles résolus au runtime via `/v1/models`)
- Microsoft : app test sur tenant ZARYA dev
- Stripe : test mode
- Pas de données client réelles
- **Toujours en mode multi-tenant** : créer plusieurs cabinets fictifs au seed

### 4.2 Preview (par PR)
- Déploiement Vercel automatique
- Branche : nom de la branche
- DB : Supabase project dédié "preview" (partagé entre PRs)
- Reset DB sur déploiement
- Données : fixtures + seed
- Accessible équipe uniquement (mot de passe)

### 4.3 Staging
- Déploiement Vercel sur push vers `develop`
- DB : Supabase project "staging" eu-central-2 (Zurich)
- Données : copie anonymisée de prod (Phase 2)
- Tests E2E exécutés ici avant merge prod
- Accessible équipe + clients pilotes invités

### 4.4 Production
- Déploiement Vercel sur push vers `main`
- DB : Supabase project "prod" eu-central-2 (Zurich)
- Données réelles
- Backups quotidiens automatiques
- Migrations DB déployées via pipeline séparé avec validation manuelle

## 5. Conventions de code

### 5.1 TypeScript strict
```json
// tsconfig.json (extrait)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Pas de `any` sauf justifié en commentaire. Pas de `// @ts-ignore`.

### 5.2 Naming
- **Fichiers** : `kebab-case.ts` (`onboarding-wizard.tsx`)
- **Composants React** : `PascalCase`
- **Variables/fonctions** : `camelCase`
- **Constantes** : `UPPER_SNAKE_CASE` (rare, préférer enum/union)
- **Types/Interfaces** : `PascalCase` (pas de préfixe `I` ou `T`)
- **DB columns** : `snake_case` (convention Postgres)

### 5.3 Organisation des imports
```typescript
// 1. Built-in Node
import { readFile } from 'fs/promises';

// 2. External packages
import { z } from 'zod';
import { NextResponse } from 'next/server';

// 3. Internal packages (workspace)
import { db } from '@zarya/db';
import { extractFactures } from '@zarya/extraction';

// 4. Local imports
import { validateFacture } from './validators';
import type { FactureProposal } from './types';
```

### 5.4 Async/await uniquement
Pas de `.then()` chains. Pas de callbacks.

### 5.5 Errors
```typescript
// Bon
class ExtractionError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// Throw typé
throw new ExtractionError('LLM_TIMEOUT', 'Infomaniak timeout after 30s', err);

// Catch ciblé
try { ... } catch (err) {
  if (err instanceof ExtractionError && err.code === 'LLM_TIMEOUT') {
    // recover
  }
  throw err;
}
```

### 5.6 Server actions vs API routes
- **Server actions** par défaut pour mutations
- **Route handlers** uniquement pour : webhooks, file uploads, intégrations tierces qui retournent des formats spécifiques

### 5.7 Multi-tenant : règle d'or
**JAMAIS** de query DB sans `cabinet_id` explicite OU sans RLS active.

Helpers obligatoires :

```typescript
// /packages/multi-tenant/src/db-client.ts
export function getDbForCabinet(cabinet_id: string) {
  // Retourne un client Drizzle/Prisma qui scope toutes les queries
  // par cabinet_id automatiquement.
}

// Usage
const db = getDbForCabinet(ctx.cabinet_id);
const clients = await db.client.findMany();  // RLS appliquée
```

### 5.8 Validation Zod
Tous les inputs externes (API, formulaires, webhooks) sont validés avec Zod **avant** d'être utilisés.

```typescript
const CreateClientSchema = z.object({
  raison_sociale: z.string().min(1).max(200),
  ide: z.string().regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/).optional(),
  langue: z.enum(['fr', 'de', 'it', 'en']),
});

// Dans le handler
const data = CreateClientSchema.parse(input);
```

## 6. Workflow Git

### 6.1 Branches
- `main` : production
- `develop` : staging
- `feat/*`, `fix/*`, `chore/*`, `docs/*` : feature branches

### 6.2 Commits
Convention **Conventional Commits** :
```
feat(facture): add IBAN fraud detection
fix(onboarding): handle Zefix timeout gracefully
docs(security): update audit retention policy
chore(deps): bump openai (client Infomaniak OpenAI-compatible) to 4.x
test(rls): add cross-tenant isolation tests
```

### 6.3 PRs
- 1 PR = 1 sujet cohérent
- Description avec contexte, changements, captures si UI
- Checklist sécurité dans le template :
  - [ ] Pas de secret committé
  - [ ] RLS policies vérifiées si nouvelle table
  - [ ] Tests d'isolation multi-tenant si applicable
  - [ ] Migrations DB réversibles
  - [ ] Audit log ajouté si action sensible
- Review obligatoire (au moins 1 dev)
- CI verte avant merge

### 6.4 Merge strategy
- `squash and merge` par défaut (historique propre)
- `rebase and merge` pour les longues séries de commits cohérents

## 7. Tests

### 7.1 Stack
- **Unit** : Vitest
- **Integration** : Vitest + Supabase test client
- **E2E** : Playwright
- **Visual regression** : optionnel, Chromatic ou Playwright snapshots

### 7.2 Coverage cible
- 70% sur le code métier critique (extraction, validation, exports)
- 90% sur la sécurité (auth, RLS, multi-tenant)
- E2E sur les parcours critiques : onboarding fiduciaire, onboarding client, validation salaire mensuel

### 7.3 Tests d'isolation multi-tenant (obligatoires en CI)

```typescript
// tests/integration/multi-tenant-isolation.test.ts
describe('Multi-tenant isolation', () => {
  test('cabinet A cannot read cabinet B data', async () => {
    const { cabinetA, cabinetB, clientB } = await setupTwoCabinets();
    
    const dbAsA = getDbForCabinet(cabinetA.id);
    const clients = await dbAsA.client.findMany();
    
    expect(clients).not.toContainEqual(
      expect.objectContaining({ id: clientB.id })
    );
  });
  
  test('cabinet A cannot insert with cabinet B id', async () => {
    // ...
  });
  
  // 8 tests minimum (SELECT/INSERT/UPDATE/DELETE × 2 directions)
});
```

Ces tests **doivent passer** en CI, sinon merge bloqué.

### 7.4 Données de test
Fixtures dans `packages/db/seed/`. Plusieurs cabinets, plusieurs clients par cabinet, états variés (en onboarding, opérationnel, en retard).

## 8. CI/CD

### 8.1 Pipelines GitHub Actions

**Sur chaque PR :**
```yaml
jobs:
  lint:
    - eslint + biome check
  typecheck:
    - tsc --noEmit
  unit-tests:
    - vitest run unit
  integration-tests:
    - supabase start
    - vitest run integration
  multi-tenant-isolation:
    - tests dédiés (bloquant)
  build:
    - next build
```

**Sur merge develop :**
```yaml
  + e2e-staging:
    - playwright test against staging URL
  + deploy-staging:
    - vercel deploy --target=staging
```

**Sur merge main :**
```yaml
  + deploy-production:
    - vercel deploy --target=production
  + migration-prod:
    - manual approval required
    - supabase db push --linked production
```

### 8.2 Secrets en CI
GitHub Actions secrets :
- `VERCEL_TOKEN`
- `SUPABASE_*` (par environnement)
- `IK_PRODUCT_ID` / `IK_API_TOKEN` (token de dev uniquement en CI)
- Pas de secrets prod en CI sauf pipeline de déploiement isolé

## 9. Logs et debugging

### 9.1 Logging applicatif
**Library** : `pino` (structured JSON logs).

```typescript
import { logger } from '@zarya/logger';

logger.info({ cabinet_id, action: 'invoice_validated' }, 'Invoice validated by user');
logger.error({ cabinet_id, error: err.message }, 'Extraction failed');
```

Niveaux :
- `error` : erreurs nécessitant action
- `warn` : anomalies sans bloquer
- `info` : événements business importants
- `debug` : détails techniques (dev only)
- `trace` : trace exhaustive (dev only, rare)

### 9.2 Filtrage des PII
Le logger redact automatiquement :
- `password`, `token`, `api_key`, `secret`
- `iban`, `numero_avs`
- `email` partiellement (`j***@example.com`)

### 9.3 Debugging local
- Chrome DevTools pour le frontend
- VS Code debugger pour le backend (configuré dans `.vscode/launch.json`)
- Logs Pino formatés avec `pino-pretty` en dev :
  ```bash
  pnpm dev | pnpm exec pino-pretty
  ```

## 10. Migrations DB

### 10.1 Outil
**Drizzle Kit** (à confirmer en début de code) ou **Prisma Migrate**.

### 10.2 Workflow
```bash
# 1. Modifier le schéma
vim packages/db/schema/crm.ts

# 2. Générer la migration
pnpm db:generate

# 3. Reviewer le SQL généré
cat packages/db/migrations/XXXX_*.sql

# 4. Appliquer en local
pnpm db:migrate

# 5. Tester
pnpm test

# 6. Commit et PR
```

### 10.3 Règles
- **Forward-only** : pas de downgrade automatique en prod
- **Réversibles** : chaque migration peut être annulée manuellement si besoin
- **Non-destructives en prod** : pas de DROP COLUMN sans process dédié
- **RLS dans la même migration** que la table créée
- **Seed séparé** : pas de données métier dans les migrations (sauf catalogues globaux)

## 11. Documentation

### 11.1 Maintenance docs/
Toute modification structurante du code doit :
1. Mettre à jour la doc concernée dans `docs/`
2. Mettre à jour `last_updated` dans le frontmatter
3. Si décision majeure : créer un ADR

### 11.2 ADR (Architecture Decision Records)
Pour toute décision avec impact long terme :
- Format markdown dans `docs/architecture/decisions/`
- Numérotation séquentielle
- Statut : proposed, accepted, deprecated, superseded
- Review en équipe avant statut `accepted`

### 11.3 Documentation inline
JSDoc pour les fonctions publiques :

```typescript
/**
 * Extracts structured data from a document via LLM.
 * 
 * @param request - Extraction parameters
 * @returns Extracted items with confidence scores
 * @throws {ExtractionError} If the LLM call fails
 * @throws {ValidationError} If the output doesn't match the schema
 */
export async function extract<T>(request: ExtractionRequest<T>): Promise<ExtractionResult<T>> {
  // ...
}
```

## 12. Sécurité dev

### 12.1 Pré-commit hooks
- `husky` + `lint-staged`
- Vérifications avant commit :
  - Pas de fichiers sensibles (`.env.local`, `*.pem`)
  - Pas de secrets détectables (regex courantes)
  - Lint + format

### 12.2 Scan des dépendances
- **Dependabot** ou **Renovate** activé
- Mise à jour mensuelle des patches
- Réaction < 24h sur vulnérabilités critiques

### 12.3 Pas d'utilisation de données prod en dev
**Règle d'or** : aucune donnée client réelle ne quitte la prod.

Pour debug d'un cas client réel :
- Reproduction en staging avec données anonymisées
- OU accès temporaire à prod via outil dédié avec audit
- Jamais de copy/paste de PII en local

## 13. Onboarding nouveau dev

Process pour qu'un nouveau dev soit opérationnel en 2 jours :

### Jour 1
- [ ] Setup local (ce document)
- [ ] Tour produit complet (utiliser ZARYA staging comme un utilisateur)
- [ ] Lecture des docs critiques : `vision.md`, `multi-tenant.md`, `security-and-audit.md`, `stack.md`
- [ ] Premier PR : fix typo ou amélioration mineure

### Jour 2
- [ ] Lecture d'un module complet (ex: `onboarding-fiduciaire.md` + son schéma)
- [ ] Pair programming sur une issue P3 (low risk)
- [ ] Création d'un cabinet fictif en local + parcours complet

### Semaine 1
- [ ] Première feature en autonomie sur module P1
- [ ] Code review d'un PR senior
- [ ] Découverte des outils ops (Sentry, Posthog, dashboards Supabase)

### Mois 1
- [ ] Owner d'un sous-module (parfait pour un dev junior)
- [ ] Participation à 1 réunion produit avec un cabinet pilote

## 14. Outils utilisés au quotidien

| Outil | Usage |
|---|---|
| GitHub | Source control, PRs, Issues, Actions |
| Vercel | Hosting, preview deployments |
| Supabase Dashboard | DB inspection, RLS testing, logs |
| Sentry | Error tracking |
| Posthog | Product analytics |
| 1Password / Bitwarden | Secrets sharing |
| Linear | Project management |
| Notion | Documentation interne (non versionnée) |
| Figma | Maquettes UI |

## 15. Communication équipe

- **Slack** : communication temps réel
- **Linear** : tickets, sprints
- **Notion** : docs internes, processes
- **Réunions** :
  - Daily standup async (Slack)
  - Weekly tech sync (1h)
  - Monthly produit + tech (2h)
  - Retrospective trimestrielle

## 16. Hors-scope pour la version actuelle de ce doc

- Process de release automatisé multi-environnement
- Politique de rollback détaillée
- Disaster recovery procedure
- Runbooks opérationnels (à créer Phase 1)
- Process de promotion vers prod (validation manuelle workflow)
- Plans de contingence (Supabase down, Infomaniak down)

À documenter avant le 1er pilote payant.

## 17. Questions ouvertes

- [ ] **ORM choisi** : Drizzle vs Prisma → décision avant code
- [ ] **Lint/format** : ESLint+Prettier vs Biome (Biome plus rapide, jeune) ?
- [ ] **Monorepo manager** : pnpm workspaces (recommandé) vs Turborepo (CI plus rapide) ?
- [ ] **Type sharing** : packages locaux vs npm registry privé ?
- [ ] **Stack analytics** : Posthog cloud EU vs self-host ?
- [ ] **CI provider** : GitHub Actions (recommandé) vs GitLab CI ?
- [ ] **Secrets management** : Vercel Env vs AWS Secrets Manager vs Doppler ?
- [ ] **PR template** : à finaliser avec la liste exacte de checks
- [ ] **Process de hotfix** : workflow rapide pour bugs critiques en prod ?
- [ ] **Feature flags** : LaunchDarkly (cher), self-host PostHog flags, ou maison ?
