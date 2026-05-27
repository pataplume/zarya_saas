---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: [data-residency, multi-tenant, llm-strategy, security-and-audit]
referenced_by: [README]
---

# Stack technique ZARYA

> Vue d'ensemble consolidée de la stack ZARYA. Ce document est le **point d'entrée technique** pour quelqu'un qui découvre l'architecture. Il pointe vers les documents détaillés pour chaque composant.

## 1. Principes directeurs

### 1.1 Contraintes non-négociables
1. **Résidence des données en UE** (Allemagne, France) — voir [`data-residency.md`](./data-residency.md)
2. **Multi-tenant natif** dès le MVP — voir [`multi-tenant.md`](./multi-tenant.md) et [ADR 0005](./decisions/0005-multi-tenant-natif-mvp.md)
3. **LLM via Bedrock eu-central-1** uniquement — voir [`llm-strategy.md`](./llm-strategy.md) et [ADR 0003](./decisions/0003-llm-via-bedrock.md)
4. **Self-service onboarding** — voir [ADR 0006](./decisions/0006-onboarding-self-service-mvp.md)
5. **Conformité RGPD + nLPD by design** — voir [`security-and-audit.md`](./security-and-audit.md)

### 1.2 Principes d'architecture
- **Mono-repo** pour MVP (avec packages séparés en interne)
- **TypeScript end-to-end** : un seul langage entre frontend, backend, scripts
- **Pas de microservices** au MVP : modulith
- **Cloud-native** : pas de self-hosting d'infra critique
- **Stateless application** : tout l'état en DB / Storage
- **Async by default** : queues et jobs pour les opérations longues

## 2. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────┐
│                       UTILISATEURS                        │
│  Cabinet fiduciaire (Sophie, Marc, Julie)                │
│  Client final PME (Patrick, Aïcha)                       │
└──────────────────────────────────────────────────────────┘
                           ↓ HTTPS
┌──────────────────────────────────────────────────────────┐
│                   EDGE LAYER (Vercel)                     │
│  - CDN, DDoS protection                                  │
│  - Edge functions pour preview/auth                      │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│              APPLICATION (Next.js 15 + RSC)               │
│  - Frontend (React, Tailwind, shadcn/ui)                 │
│  - API routes (server actions, route handlers)           │
│  - Auth middleware                                       │
│  Hébergé sur Vercel (eu-central-1) ou ECS                │
└──────────────────────────────────────────────────────────┘
       ↓                    ↓                    ↓
       ↓               ┌──────────────┐         ↓
       ↓               │ JOBS / QUEUE │         ↓
       ↓               │ (pg_cron +   │         ↓
       ↓               │ LISTEN/NOTIFY)│        ↓
       ↓               └──────────────┘         ↓
       ↓                    ↓                    ↓
       ↓     ┌──────────────┴─────────────┐     ↓
       ↓     ↓                            ↓     ↓
       ↓ ┌─────────────┐  ┌──────────────────────┐ ↓
       ↓ │  SUPABASE   │  │  INTÉGRATIONS TIERCES │ ↓
       ↓ │  (Frankfurt)│  │                       │ ↓
       ↓ │             │  │  - Bedrock EU         │ ↓
       ↓ │ - Postgres  │  │  - Mistral La Plat.   │ ↓
       ↓ │ - Auth      │  │  - Microsoft Graph    │ ↓
       ↓ │ - Storage   │  │  - Zefix              │ ↓
       ↓ │ - pgvector  │  │  - Bexio              │ ↓
       ↓ │ - Vault     │  │  - Stripe             │ ↓
       ↓ │ - Realtime  │  │  - NAS cabinets       │ ↓
       ↓ └─────────────┘  └──────────────────────┘ ↓
       ↓                                            ↓
       └────────────────────────────────────────────┘
                  Observabilité & Monitoring
                  (Sentry, CloudWatch, Posthog)
```

## 3. Frontend

### 3.1 Stack
- **Framework** : Next.js 15+ (App Router)
- **React** : v18+ avec Server Components
- **Styling** : Tailwind CSS v4
- **Composants** : shadcn/ui + composants custom
- **State** :
  - `React Query` pour data fetching et cache server
  - `Zustand` pour state global léger
  - `useState` / `useReducer` pour state local
- **Forms** : React Hook Form + Zod
- **i18n** : next-intl (FR / DE / IT au MVP, EN ensuite)
- **Charts** : Recharts ou Tremor
- **PWA** : manifest + service worker basique pour Dashboard Client mobile

### 3.2 Surfaces produit
1. **Dashboard fiduciaire** : interface complète pour cabinets
2. **Dashboard client** : interface mobile-first pour clients finaux PME
3. **Landing & marketing** : pages publiques de présentation

Chaque surface est un sous-domaine ou un préfixe :
- `app.zarya.ch` : dashboard fiduciaire et client (différentiation par rôle)
- `zarya.ch` : marketing + sign-up

### 3.3 UX patterns établis
- Validation 1-clic systématique
- Sauvegarde temps réel sans bouton Save
- Branding cabinet sur le dashboard client
- Microcopy sans jargon côté client final
- Mobile-first pour dashboard client, desktop-first pour fiduciaire

## 4. Backend

### 4.1 Stack
- **Runtime** : Node.js 22+ (LTS)
- **Framework** : Next.js API routes + server actions
- **Pourquoi pas d'API séparée ?** : modulith Next.js pour MVP, séparation possible plus tard si besoin (peu probable < 100 cabinets)
- **ORM** : Drizzle ORM ou Prisma (à trancher au moment du code)
- **Validation** : Zod partout

### 4.2 Patterns de code
- `/app` : routes Next.js (pages + API)
- `/lib` : logique métier
  - `/lib/integrations/{bexio,microsoft,zefix,bedrock}` : wrappers externes
  - `/lib/extraction` : pipeline IA générique
  - `/lib/auth` : helpers auth
  - `/lib/multi-tenant` : helpers tenant resolution
- `/db` : schémas Drizzle/Prisma, migrations
- `/packages` : libs partagées (types, schemas Zod, utils)

### 4.3 Server Actions vs Route Handlers
- **Server Actions** par défaut : RSC + mutations simples
- **Route Handlers** quand : webhook entrant, fichier upload, integration tierce avec retour spécifique

## 5. Base de données

### 5.1 Stack
- **Postgres 16+** via **Supabase Cloud**
- **Région** : eu-central-1 (Frankfurt)
- **Plan** : Pro au minimum (sauvegarde quotidienne, PITR, Vault)

### 5.2 Schémas Postgres
```
crm.*              -- centre de vérité, cabinets, clients, contacts, événements
salaire.*          -- employés, périodes, éléments paie, propositions
doc.*              -- documents, propositions classement
facture.*          -- factures fournisseurs, propositions, fournisseurs
extraction.*       -- invocations LLM, audit générique
audit.*            -- logs sensibles
auth.*             -- géré par Supabase Auth
storage.*          -- géré par Supabase Storage
```

### 5.3 Extensions utilisées
- `pgvector` : recherche sémantique (module Search)
- `pg_cron` : jobs planifiés
- `pgcrypto` : opérations crypto
- `pg_trgm` : recherche textuelle floue
- `uuid-ossp` : génération UUIDs

### 5.4 Migrations
- Outil : Drizzle Kit ou Prisma Migrate
- Stratégie : forward-only, pas de downgrade automatique
- Conventions : numérotées + horodatées + descriptives
- Review obligatoire en PR (impact RLS, perf, breaking)

### 5.5 RLS
Voir [`multi-tenant.md` § 5](./multi-tenant.md).

## 6. Storage

### 6.1 Supabase Storage
- **Backend** : S3-backed (eu-central-1)
- **Buckets** :
  - `documents-cabinet` : documents validés (long terme)
  - `documents-brut` : ingestion temporaire (purgé après 30 jours)
  - `extracts-temp` : exports générés (TTL 7 jours)
  - `cabinet-assets` : logos, branding (public avec ACL)

### 6.2 Politique d'accès
- Chiffrement at rest (SSE)
- RLS Storage basée sur `cabinet_id`
- Signed URLs pour le téléchargement (TTL court : 1h)
- Pas de bucket public sauf assets de branding

## 7. Authentification

### 7.1 Supabase Auth
- Email + mot de passe
- Magic links (activation initiale, reset)
- 2FA TOTP (Phase 2 : obligatoire)
- SSO SAML (Phase 2+)

### 7.2 JWT contenu
- `cabinet_id` (sauf pour contact client)
- `client_id` (pour contact client)
- `role` (responsable, gestionnaire_salaires, collaborateur, lecteur, client_contact)

### 7.3 Détails
Voir [`security-and-audit.md` § 4-5](./security-and-audit.md).

## 8. LLM et IA

### 8.1 Amazon Bedrock (eu-central-1)
- **Claude Sonnet 4.6** : extractions critiques (factures, employés, clients)
- **Claude Haiku 4.5** : volume élevé (classification doc, changements salariaux)

### 8.2 Mistral La Plateforme (Paris)
- **OCR** : PDFs scannés, images

### 8.3 Embeddings
- Modèle d'embedding Bedrock (Cohere Embed Multilingual ou Titan Embeddings)
- Stockage dans `pgvector`

### 8.4 Wrapper interne
Voir [`extraction-ia.md`](../modules/extraction-ia.md) et [`llm-strategy.md`](./llm-strategy.md).

## 9. Intégrations externes

### 9.1 Côté fiduciaire (Phase MVP)
- **Microsoft Graph API** : email, calendrier
- **Zefix** : identité entreprises suisses
- **Bexio API** : compta + payroll
- **NAS du cabinet** : SMB/WebDAV
- **Stripe** : paiement abonnements ZARYA

### 9.2 Phase 2
- Bexio Webhooks
- Banques (open banking, EBICS)
- Crésus (export structuré)

### 9.3 Phase 3
- Abacus (AbaConnect certifié)
- Swissdec ELM (transmetteur salaires)

Détails dans chaque doc d'intégration.

## 10. Jobs et async

### 10.1 Patterns
- **pg_cron** : jobs planifiés (nightly, hourly)
- **Postgres LISTEN/NOTIFY** : événements applicatifs
- **Edge Functions Supabase** (ou Vercel cron) : tâches courtes
- **Queue dédiée** : si besoin de pattern queue avancée → Inngest ou QStash (à évaluer Phase 2)

### 10.2 Jobs identifiés MVP
- Scan NAS périodique
- Renouvellement subscriptions Microsoft Graph
- Génération échéances récurrentes
- Détection inactivité onboarding fiduciaire
- Recalcul scores de risque clients
- Export batch vers logiciels comptables
- Backup logs audit
- Métriques agrégées

## 11. Observabilité

### 11.1 Logs
- **Application logs** : structured JSON, envoyés à CloudWatch
- **Niveau** : INFO en prod, DEBUG en dev
- **Filtrage des PII** : automatique (libs comme `pino` avec redaction)

### 11.2 Métriques
- **CloudWatch** : métriques infra
- **Application metrics** : custom via OpenTelemetry (Phase 2)
- **Business metrics** : Posthog ou Mixpanel

### 11.3 Erreurs
- **Sentry** : tracking erreurs frontend + backend
- Tagging par `cabinet_id` pour debug
- Alertes sur erreurs critiques

### 11.4 Analytics produit
- **Posthog** ou **Mixpanel** : événements user
- Funnel onboarding, adoption modules
- Self-hosted Posthog envisageable pour souveraineté Phase 2

### 11.5 Uptime
- **Better Uptime** ou similaire
- Status page publique (Phase 2)

## 12. CI / CD

### 12.1 Source control
- **GitHub** (ou GitLab) avec branches protégées
- PRs obligatoires
- Code review systématique

### 12.2 Build & test
- **GitHub Actions** (ou GitLab CI)
- Lint : ESLint + Biome
- Format : Prettier ou Biome
- Tests : Vitest + Playwright pour E2E
- Tests d'isolation multi-tenant : obligatoires en CI

### 12.3 Déploiement
- **Vercel** : déploiement automatique sur push vers `main` (production) et `develop` (staging)
- Preview deployments sur chaque PR
- Migrations DB : pipeline séparé, validation manuelle

### 12.4 Environnements
- **local** : dev, tests, isolation totale
- **preview** : par PR, données mock
- **staging** : pré-prod avec données synthétiques, accessible équipe
- **production** : Frankfurt, données réelles

Voir [`dev-environment.md`](./dev-environment.md) pour détail.

## 13. Coûts d'infrastructure (estimation MVP)

Pour 10 cabinets pilotes :

| Poste | Coût mensuel | Notes |
|---|---|---|
| Vercel Pro | ~20 USD | Suffisant pour MVP |
| Supabase Pro | ~25 USD | Per project, Frankfurt |
| Bedrock LLM | ~500 USD | Variable selon usage |
| Mistral OCR | ~100 USD | Variable |
| Storage S3 | ~10 USD | Inclus dans Supabase Pro initialement |
| Sentry | ~30 USD | Plan Team |
| Posthog | ~50 USD | Self-host Phase 2 |
| Stripe | 1.4% + 0.30 CHF | Sur les transactions cabinet |
| **Total** | **~700 USD** | 10 cabinets = 70 USD/cabinet |

À 100 cabinets payants (Pro 499 CHF/mois = 50K CHF MRR), les coûts scalent à ~5-10K USD/mois. Marge brute restée à 75-80%.

## 14. Décisions structurantes (ADR)

Tous documentés dans `/docs/architecture/decisions/` :

| ADR | Sujet | Statut |
|---|---|---|
| 0001 | Résidence des données UE | À écrire |
| 0002 | Stack backend | À écrire |
| 0003 | LLM via Bedrock | Accepté |
| 0004 | Supabase vs self-hosted | À écrire |
| 0005 | Multi-tenant natif MVP | Accepté |
| 0006 | Onboarding self-service MVP | Accepté |
| 0007 | Validation granulaire onboarding | À écrire |
| 0008 | Mini-dashboard client | À écrire |

## 15. Évolutions architecturales prévues

### 15.1 Phase 2
- **Cache Redis** pour Zefix et autres lookups fréquents
- **Queue Inngest** pour orchestration complexe
- **Self-hosted Posthog** pour souveraineté analytics
- **CDN images** dédié (Cloudinary ou similaire) pour les uploads documents
- **Replica read** Postgres pour analytics lourdes

### 15.2 Phase 3
- **Split en microservices** si certains modules nécessitent un scaling indépendant (Search, Extraction IA)
- **Multi-region** : option Suisse stricte (Azure Switzerland North) pour cabinets sensibles
- **CDN propre** (Bunny.net en EU)
- **Stack analytics dédiée** (data warehouse, dbt)

## 16. Limites connues et risques techniques

### 16.1 Supabase scaling
- Limite estimée : ~100-200 cabinets actifs simultanément sur un projet Supabase Pro
- Solution Phase 2 : Supabase Enterprise ou self-host
- Migration plan documenté à préparer dès qu'on atteint 50 cabinets

### 16.2 Bedrock disponibilité régionale
- eu-central-1 stable pour Claude
- Mais Bedrock évolue : si Anthropic sort un nouveau modèle, disponibilité EU avec délai
- Monitoring de la roadmap Bedrock requis

### 16.3 Vercel et résidence des données
- Vercel ne garantit pas une résidence stricte EU pour TOUTES les fonctions
- Solution : déployer compute sur ECS eu-central-1 si exigence stricte
- Décision : Vercel MVP, migration ECS si requis (transparent pour le code)

### 16.4 Coûts LLM imprévisibles
- Risque : un cabinet utilise massivement → dépassement de marge
- Mitigation : quotas par plan + monitoring + facturation à l'usage si nécessaire

## 17. Documentation technique consolidée

Pour chaque composant, doc dédiée :
- [Multi-tenant](./multi-tenant.md)
- [LLM strategy](./llm-strategy.md)
- [Data residency](./data-residency.md)
- [Security & audit](./security-and-audit.md)
- [Microsoft integration](./microsoft-integration.md)
- [Zefix integration](./zefix-integration.md)
- [Payroll integration](./payroll-integration.md)
- [NAS ingestion](./nas-ingestion.md)
- [Dev environment](./dev-environment.md) (à créer)
- [ADRs](./decisions/)

## 18. Questions ouvertes au niveau stack

- [ ] **ORM** : Drizzle vs Prisma ? (préf perso : Drizzle pour la fluidité TypeScript)
- [ ] **Queue** : Inngest vs QStash vs LISTEN/NOTIFY suffisant ?
- [ ] **Analytics** : Posthog cloud (EU) ou self-host dès MVP ?
- [ ] **Monitoring** : Sentry ou alternative EU (Bugsnag, Highlight) ?
- [ ] **i18n** : tous textes via next-intl ou approche mixte ?
- [ ] **PWA mobile** : suffisant ou app native (Capacitor) Phase 2 ?
- [ ] **Stripe vs Mollie** : pour les paiements suisses ?
- [ ] **Edge functions** vs Node serverless : où placer la frontière ?
