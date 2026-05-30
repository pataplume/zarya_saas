# Instructions Claude Code — ZARYA

> Ce fichier est lu automatiquement par Claude Code à chaque session. Il définit les règles non-négociables du projet ZARYA.

## Contexte projet

ZARYA est un SaaS B2B pour fiduciaires suisses. Co-pilote opérationnel pour gestion documentaire, échéances, factures, et salaires de leurs clients PME.

**Stack** : Next.js 15+, TypeScript end-to-end strict, Supabase (Postgres + Auth + Storage + Vault + pgvector), Drizzle ORM, **Infomaniak AI Services** (Qwen3.5-122B, Ministral-3-14B, Bge embeddings — souveraineté suisse, API OpenAI-compatible), Microsoft Graph, Tailwind + shadcn/ui.

**Hébergement** : eu-central-1 (Frankfurt) exclusivement pour le MVP. Aucune donnée hors UE.

**Documentation produit** : `/docs/` contient 64 fichiers spécifiant tous les modules, schémas DB, intégrations, ADR, et conformité. À consulter avant tout code.

## Règles non-négociables

### 1. Multi-tenant — RÈGLE ABSOLUE
- TOUTE table métier porte `cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT`
- TOUTE query DB passe par `getDbForCabinet(cabinet_id)` — jamais de query directe sans scope
- TOUTE table a des RLS policies filtrant par `current_cabinet_id()`
- Tests d'isolation multi-tenant OBLIGATOIRES en CI (bloquants pour merge)
- Aucune feature, optimisation, ou refactor ne peut compromettre cette règle
- **Exception documentée** : `crm.zefix_recherche_cabinet` autorise `cabinet_id NULL` pendant l'étape A de l'onboarding fiduciaire (cabinet pas encore créé), avec backfill obligatoire. Voir ADR 0009.
- Référence : `/docs/architecture/multi-tenant.md` et `ADR 0005`

### 2. Sécurité
- Validation Zod systématique sur TOUS les inputs externes (API, formulaires, webhooks)
- Aucun secret committé (vérifier `.gitignore`)
- Aucun log de PII (utiliser `pino` avec redact ; redact obligatoire sur `authorization`, `cookie`, `ZEFIX_PASSWORD`, `*_token`, `*_secret`)
- Champs ultra-sensibles chiffrés via Supabase Vault (IBAN, numéro AVS, tokens OAuth, credentials Zefix en prod)
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
- Conservation 6 ans minimum (5 ans pour les logs Zefix, cf. `zefix-integration.md` § 4.3)
- Référence : `/docs/architecture/security-and-audit.md` § 8

### 6. Stratégie LLM — souveraineté suisse (Infomaniak)
- Toute la couche IA passe par **Infomaniak AI Services** (société + infra suisses), API OpenAI-compatible. Jamais d'API Anthropic/OpenAI/Bedrock directe.
- Wrapper unique dans `packages/integrations/infomaniak/` (client OpenAI-compatible)
- **Aucun `model_id` codé en dur** : lus au runtime via `GET /v1/models`, mappés par catégorie (`chat_small`, `chat_large`, `embeddings`…). Catalogue IK en Beta.
- Secrets serveur uniquement (`IK_PRODUCT_ID`, `IK_API_TOKEN`), `pino redact` sur le token
- Tracé dans `extraction.invocation` pour audit et facturation
- Référence : `/docs/architecture/llm-strategy.md` et **`ADR 0010`** (remplace ADR 0003)

### 7. Intégrations tierces — secrets côté serveur uniquement
- Tout credential d'API tierce (Zefix, Microsoft Graph, Bexio, NAS) est **interdit côté client navigateur**
- Stocké en variables d'environnement (dev) ou Supabase Vault (prod)
- Pino `redact` configuré pour masquer ces valeurs dans tous les logs
- Pour Zefix spécifiquement : HTTP Basic Auth, l'API ne supporte pas CORS, accès **uniquement via route handlers** `/api/zefix/*`. Voir `ADR 0009` et `/docs/architecture/zefix-integration.md`.

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
- Route Handlers seulement pour : webhooks entrants, file uploads, intégrations tierces avec retour spécifique (Zefix, Microsoft Graph, etc.)
- **Cas Zefix** : l'API ne supporte pas CORS, donc tous les appels Zefix passent par `/api/zefix/*` (route handlers). Jamais d'appel direct depuis le navigateur. Voir ADR 0009.

### Errors
- Classes d'erreur typées (`ExtractionError`, `ValidationError`, `ZefixAuthError`, `ZefixRateLimitError`, etc.)
- Catch ciblé, pas de catch global qui swallow tout
- Erreurs loggées avec contexte (cabinet_id, user_id quand applicable)
- 401/403 sur API tierce → alerte ops critique (credentials cassés)

## Ce que tu NE fais PAS sans demander

- Ajouter une dépendance npm (justifier l'ajout)
- Modifier le schéma DB sans migration
- Désactiver une RLS policy
- Coder un module non prioritaire selon la phase actuelle
- Refactor majeur non demandé
- Toucher aux secrets/credentials (Zefix, Infomaniak, Microsoft, Supabase service role)
- Optimiser prématurément
- Introduire un nouveau pattern architectural transverse
- Modifier les CLAUDE.md sans validation explicite
- Exposer un credential d'API tierce côté client (jamais, sans exception)
- Faire un appel HTTP direct à une API tierce depuis du code client (`use client`)

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
| `/docs/architecture/zefix-integration.md` | Avant de toucher à Zefix (onboarding cabinet/client, recherche entreprise) |
| `/docs/architecture/decisions/` | Pour comprendre les choix architecturaux |
| `/docs/modules/[module].md` | Avant d'implémenter un module |
| `/docs/data-model/[schema].md` | Avant de créer/modifier des tables |
| `/docs/flows/[flow].md` | Pour comprendre un parcours utilisateur |

## Référence des ADR (10 décisions actées)

- **ADR 0001** : Résidence des données en UE (Frankfurt)
- **ADR 0002** : Stack Next.js + TypeScript end-to-end
- ~~**ADR 0003** : LLM via Bedrock eu-central-1~~ → **remplacée par ADR 0010**
- **ADR 0004** : Supabase Cloud Pro jusqu'à 100 cabinets
- **ADR 0005** : Multi-tenant natif dès le MVP
- **ADR 0006** : Onboarding fiduciaire self-service
- **ADR 0007** : Validation granulaire champ par champ pour employés
- **ADR 0008** : Mini-dashboard client dédié
- **ADR 0009** : Intégration Zefix via route handler serveur avec HTTP Basic Auth
- **ADR 0010** : Couche IA via Infomaniak AI Services (souveraineté suisse) — remplace ADR 0003

## Phase actuelle du projet

> **Séquencement : la source de vérité est la séquence canonique Blocs 0→H (ADR 0012).**
> Les anciennes « Phases 4.x » sont périmées (réconciliées par l'ADR 0012, action founder
> §135 appliquée). L'**exécution** détaillée (sous-blocs, DoD, rituel, arbitrages) vit dans
> **`KICKOFF-BLOCS-B-H.md`** (racine) — à lire en début de chaque session. `HANDOFF_V2.md` §0
> reste l'état opérationnel.

**Bloc courant** : **Bloc B — Doc fini** (classif live sur texte réel, MAJ `crm.document_attendu`,
file de validation). La **fondation CRM (Bloc A) est SCELLÉE**.

**Séquence canonique (ADR 0012) :**
- ✅ **Bloc 0** — Gouvernance (ADR 0012)
- ✅ **Bloc A — Fondation CRM v1.0 SCELLÉE** — runs A1→A10 + correctif AVS, mergés (migrations 0009→0019). ~20 tables `crm.*` + RLS + triggers cohérence + vues `crm.v_*` + catalogues `crm.standard_*`.
- 🚧 **Bloc B — Doc fini** ← **en cours (prochain)**
- ⬜ **Bloc C** — Calendar fini (Runs 1-5 livrés ; restent génération auto échéances + envoi relances + UI)
- ⬜ **Bloc D** — Microsoft Graph (OAuth + wrapper, à construire de zéro)
- ⬜ **Bloc E** — Facture (QR-bill + extraction IA + export ; ADR QR-bill à ouvrir)
- ⬜ **Bloc F** — onboarding-client + dashboard-client
- ⬜ **Bloc G** — Salaire (workflow, PAS de calcul de paie)
- ⬜ **Bloc H** — embeddings/pgvector + Search (bloqué tant que modèle `embeddings` IK non câblé)
- ⬜ **Phase I** — Chiffrement au repos colonnes ultra-sensibles (ADR 0013) — placé après H (décision founder ; ⚠️ ré-arbitrer au 1er write-path E/F/G)

**Historique bouclé** (pour mémoire) : Phase 0 Bootstrap · Phase 1 Multi-tenant + Auth ·
Phase 2a Onboarding fiduciaire · Phase 2b Hardening · Phase 2c Paramètres & dashboard ·
Phase 3 Module Doc (squelette) · Phase 3.5 Sécurité cross-tenant + Mini-CRM · Phase 3.6
Tests server action authentifiée · Phase 4.0 Migration IA → Infomaniak (classif **live
validée** sur golden set ; `EXTRACTION_MODE=stub` reste le défaut prod).

**État des modules** :
- ✅ Fondation CRM (Bloc A) scellée — contrat de schéma stable, « jamais reshapé » (ADR 0012)
- ⚠️ **Module Doc : squelette OK + classif live validée, mais `EXTRACTION_MODE=stub` reste le défaut prod** tant que le Bloc B (bascule complète + MAJ `document_attendu` + file de validation) n'est pas livré. Ne PAS présenter comme « IA fonctionnelle » end-to-end avant la clôture du Bloc B.
- ✅ OCR texte natif livré ; ⚠️ OCR `vision` + `embeddings` Infomaniak **différés** (pré-requis explicite de E/F-scans et de tout H).

**Règles de périmètre (Blocs B→H)** :
- Suivre `KICKOFF-BLOCS-B-H.md` : un sous-bloc = une PR, DoD universel respecté, arbitrages `⚠️` tranchés par le founder **avant** de coder (ne pas inventer une convention non documentée).
- **Réordonner B→H** possible selon priorité produit ; **ne jamais toucher au Bloc A** (scellé).
- IA via **Infomaniak** uniquement (catégories, pas de `model_id` en dur). Pas d'`StubClassifier` modifié tant qu'il est le défaut prod.
- Toute nouvelle table métier : DoD complet (migration additive + RLS + triggers + `METIER_TABLES`/`RLS_TABLES` + tests isolation **et** anti-fuite, bloquants CI) + **zéro FK fantôme**.

**⚠️ Risques connus** :
- Le `db` applicatif (service role, postgres-js) **bypasse la RLS** — la sécurité multi-tenant du chemin app repose sur le filtre `cabinet_id` discipliné dans chaque WHERE + le trigger `fn_check_client_cabinet`, **pas** sur la RLS. Voir addendum ADR 0005.
- `getDbForCabinet()` est un stub : la propagation JWT + `SET LOCAL` n'est pas implémentée (différé).
- **CI n'applique pas les migrations** : appliquer à la base Supabase partagée avant que les tests la référencent.
- Colonnes ultra-sensibles (IBAN/AVS/tokens/credentials) : **chiffrement au repos exigé au 1er write-path** (ADR 0013) — ne pas écrire en clair en E/F/G.

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
