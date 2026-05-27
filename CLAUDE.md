# Instructions Claude Code — ZARYA

> Ce fichier est lu automatiquement par Claude Code à chaque session. Il définit les règles non-négociables du projet ZARYA.

## Contexte projet

ZARYA est un SaaS B2B pour fiduciaires suisses. Co-pilote opérationnel pour gestion documentaire, échéances, factures, et salaires de leurs clients PME.

**Stack** : Next.js 15+, TypeScript end-to-end strict, Supabase (Postgres + Auth + Storage + Vault + pgvector), Drizzle ORM, AWS Bedrock (Claude Sonnet 4.6 + Haiku 4.5), Mistral OCR, Microsoft Graph, Tailwind + shadcn/ui.

**Hébergement** : eu-central-1 (Frankfurt) exclusivement pour le MVP. Aucune donnée hors UE.

**Documentation produit** : `/docs/` contient 63 fichiers spécifiant tous les modules, schémas DB, intégrations, ADR, et conformité. À consulter avant tout code.

## Règles non-négociables

### 1. Multi-tenant — RÈGLE ABSOLUE
- TOUTE table métier porte `cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT`
- TOUTE query DB passe par `getDbForCabinet(cabinet_id)` — jamais de query directe sans scope
- TOUTE table a des RLS policies filtrant par `current_cabinet_id()`
- Tests d'isolation multi-tenant OBLIGATOIRES en CI (bloquants pour merge)
- Aucune feature, optimisation, ou refactor ne peut compromettre cette règle
- Référence : `/docs/architecture/multi-tenant.md` et `ADR 0005`

### 2. Sécurité
- Validation Zod systématique sur TOUS les inputs externes (API, formulaires, webhooks)
- Aucun secret committé (vérifier `.gitignore`)
- Aucun log de PII (utiliser `pino` avec redact)
- Champs ultra-sensibles chiffrés via Supabase Vault (IBAN, numéro AVS, tokens OAuth)
- Référence : `/docs/architecture/security-and-audit.md`

### 3. TypeScript strict
- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- Aucun `any` sauf justifié en commentaire
- Aucun `// @ts-ignore`
- Types partagés via packages workspace (pas de duplication)

### 4. Pattern proposition → validation → entité finale
- Toute extraction IA crée une table `proposition_*`
- Validation humaine obligatoire par défaut
- Création de l'entité finale via trigger à la validation
- Référence : `/docs/modules/extraction-ia.md` et `ADR 0007`

### 5. Audit log
- Toutes les actions sensibles loggées dans `audit.*` (append-only)
- Pas de DELETE/UPDATE sur les tables d'audit
- Conservation 6 ans minimum
- Référence : `/docs/architecture/security-and-audit.md` § 8

### 6. Stratégie LLM
- Tous les appels LLM passent par Bedrock eu-central-1 (jamais d'API Anthropic directe)
- Wrapper unique dans `packages/integrations/bedrock/`
- Tracé dans `extraction.invocation` pour audit et facturation
- Référence : `/docs/architecture/llm-strategy.md` et `ADR 0003`

## Process de travail

### Avant d'écrire du code
1. Lire la doc concernée dans `/docs/`
2. Lire le schéma DB concerné dans `/docs/data-model/`
3. Vérifier les ADR pertinents dans `/docs/architecture/decisions/`
4. Si décision structurante non documentée : créer un ADR avant de coder
5. Proposer un plan en mode plan-mode avant d'écrire du code

### Pour chaque feature
1. Implémenter le minimum demandé (pas plus)
2. Tests d'isolation multi-tenant si table métier
3. Tests du chemin nominal
4. Tests des cas d'erreur principaux
5. Pas de code commenté laissé dans le repo
6. Pas de TODO sans ticket associé

### Commits
- Conventional commits : `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`, `perf:`
- Un commit = un sujet cohérent
- Référencer l'ADR ou la doc concernée dans le commit body si pertinent
- Référence : `/docs/architecture/dev-environment.md`

### Branches
- `main` = production
- `develop` = staging
- Branches features : `feat/`, `fix/`, `chore/`
- Jamais de commit direct sur `main` ou `develop`

## Conventions de code

### Naming
- Fichiers : `kebab-case.ts` (`onboarding-wizard.tsx`)
- Composants React : `PascalCase`
- Variables/fonctions : `camelCase`
- DB columns : `snake_case`
- Types/Interfaces : `PascalCase` (pas de préfixe I ou T)

### Organisation
- `/apps/web` : app Next.js
- `/packages/db` : schémas Drizzle, migrations, seed
- `/packages/extraction` : pipeline IA générique
- `/packages/integrations/{bedrock,microsoft,zefix,bexio,nas}` : wrappers externes
- `/packages/multi-tenant` : helpers cabinet resolution
- `/packages/auth` : helpers auth + RBAC
- `/packages/schemas` : schémas Zod partagés
- `/packages/ui` : composants shadcn/ui customisés

### Server actions vs Route handlers
- Server Actions par défaut pour les mutations
- Route Handlers seulement pour : webhooks entrants, file uploads, intégrations tierces avec retour spécifique

### Errors
- Classes d'erreur typées (`ExtractionError`, `ValidationError`, etc.)
- Catch ciblé, pas de catch global qui swallow tout
- Erreurs loggées avec contexte (cabinet_id, user_id quand applicable)

## Ce que tu NE fais PAS sans demander

- Ajouter une dépendance npm (justifier l'ajout)
- Modifier le schéma DB sans migration
- Désactiver une RLS policy
- Coder un module non prioritaire selon la phase actuelle
- Refactor majeur non demandé
- Toucher aux secrets/credentials
- Optimiser prématurément
- Introduire un nouveau pattern architectural transverse
- Modifier les CLAUDE.md sans validation explicite

## Mode de travail recommandé

- **Sessions courtes** : 30-60 min entre 2 reviews
- **Plan mode** systématique pour toute feature non triviale
- **Auto-accept OFF** au début, à activer progressivement sur les tâches répétitives sûres
- **Granularité fine** : 1 fichier = 1 prompt souvent, pas "implémente le module entier"

## Documents critiques à connaître

| Document | Quand le lire |
|---|---|
| `/docs/architecture/stack.md` | Vue d'ensemble technique |
| `/docs/architecture/multi-tenant.md` | Avant toute feature qui touche à la DB |
| `/docs/architecture/security-and-audit.md` | Avant toute feature sensible |
| `/docs/architecture/dev-environment.md` | Pour les conventions et le setup |
| `/docs/architecture/decisions/` | Pour comprendre les choix architecturaux |
| `/docs/modules/[module].md` | Avant d'implémenter un module |
| `/docs/data-model/[schema].md` | Avant de créer/modifier des tables |
| `/docs/flows/[flow].md` | Pour comprendre un parcours utilisateur |

## Référence des ADR (8 décisions actées)

- **ADR 0001** : Résidence des données en UE (Frankfurt)
- **ADR 0002** : Stack Next.js + TypeScript end-to-end
- **ADR 0003** : LLM via Bedrock eu-central-1
- **ADR 0004** : Supabase Cloud Pro jusqu'à 100 cabinets
- **ADR 0005** : Multi-tenant natif dès le MVP
- **ADR 0006** : Onboarding fiduciaire self-service
- **ADR 0007** : Validation granulaire champ par champ pour employés
- **ADR 0008** : Mini-dashboard client dédié

## Phase actuelle du projet

[À METTRE À JOUR à chaque transition de phase]

**Phase courante** : Phase 1 — MVP P0

**Modules en cours** : DB Foundation + Auth

**Modules autorisés à coder** : `packages/db`, `packages/auth`, `apps/web` (auth layer)

**Modules interdits** : CRM, Doc, Calendar, Extraction IA, Facture, Salaire, Search

## Tests obligatoires en CI

1. Lint (ESLint ou Biome)
2. Typecheck (`tsc --noEmit`)
3. Tests unitaires
4. Tests d'intégration
5. **Tests d'isolation multi-tenant** (bloquants, jamais skippables)
6. Build (`next build`)

## Si tu as un doute

1. Relis ce document
2. Lis la doc concernée dans `/docs/`
3. Demande clarification plutôt que d'inventer
4. Ne devine pas une convention si elle n'est pas documentée
5. Propose un ADR si la décision est structurante
