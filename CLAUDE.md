# Instructions Claude Code — ZARYA

> Ce fichier est lu automatiquement par Claude Code à chaque session. Il définit les règles non-négociables du projet ZARYA.

## Contexte projet

ZARYA est un SaaS B2B pour fiduciaires suisses. Co-pilote opérationnel pour gestion documentaire, échéances, factures, et salaires de leurs clients PME.

**Stack** : Next.js 15+, TypeScript end-to-end strict, Supabase (Postgres + Auth + Storage + Vault + pgvector), Drizzle ORM, **Infomaniak AI Services** (Qwen3.5-122B, Ministral-3-14B, Bge embeddings — souveraineté suisse, API OpenAI-compatible), Microsoft Graph, Tailwind + shadcn/ui.

**Hébergement** : données au repos sur Supabase **eu-central-2 (Zurich, Suisse)** ; compute / cron sur **Vercel fra1 (Frankfurt, UE)** ; couche IA sur **Infomaniak AI Services (Suisse)**. Aucune donnée hors Suisse / UE — la Suisse est un pays tiers **adéquat** (RGPD art. 45). Voir l'amendement de l'`ADR 0001`.

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

## Référence des ADR (24 décisions actées)

- **ADR 0001** : Résidence des données (amendée — au repos en Suisse, Supabase eu-central-2/Zurich ; compute UE/Vercel fra1)
- **ADR 0002** : Stack backend Next.js + TypeScript end-to-end
- ~~**ADR 0003** : LLM via Amazon Bedrock (eu-central-1)~~ → **remplacée par ADR 0010**
- **ADR 0004** : Supabase Cloud vs self-hosted Postgres
- **ADR 0005** : Multi-tenant natif dès le MVP (`crm.cabinet` au sommet ; addendum : `db` app bypasse la RLS)
- **ADR 0006** : Onboarding fiduciaire self-service
- **ADR 0007** : Validation granulaire (champ par champ) à l'onboarding client
- **ADR 0008** : Mini-dashboard client dédié vs validation par email Excel
- **ADR 0009** : Intégration Zefix via route handler serveur avec HTTP Basic Auth
- **ADR 0010** : Couche IA via Infomaniak AI Services (souveraineté suisse) — remplace ADR 0003
- **ADR 0011** : Périmètre MVP du module Calendar (échéances & relances)
- **ADR 0012** : Séquence canonique v1.0 (fondation CRM complète, puis modules en ordre de dépendance)
- **ADR 0013** : Chiffrement des colonnes ultra-sensibles — différé au write-path, mécanisme Vault
- **ADR 0014** : Sémantique des seuils de confiance Doc (rattachement client vs auto-classement)
- **ADR 0015** : Modèle de scoring du risque client (`crm.risque`)
- **ADR 0016** : Séquencement Calendar / Microsoft Graph (Bloc C scindé autour du Bloc D)
- **ADR 0017** : Logging structuré via pino + redact
- **ADR 0018** : App Azure AD multi-tenant ZARYA (A) par défaut, app par cabinet (B) à la demande
- **ADR 0019** : Tracking des relances — exception au sceau du Bloc A (`crm.relance.*message_id`) + draft+send
- **ADR 0020** : Décodage QR-facture suisse (parser/validators déterministes ; extraction image livrée Bloc E)
- **ADR 0021** : Finalisation proposition → `salaire.employe` en app-code (addendum règle 4)
- **ADR 0022** : Stratégie embeddings & RAG du Bloc H (Search)
- **ADR 0023** : Activation de l'IA par cabinet + suivi des coûts (bascule `EXTRACTION_MODE`)
- **ADR 0024** : Extraction facture en cascade + provenance par champ

## Phase actuelle du projet

> **Séquencement : la séquence canonique Blocs A→H (ADR 0012) est CLÔTURÉE.** Les anciennes
> « Phases 4.x » sont périmées (réconciliées par l'ADR 0012). **L'état opérationnel courant et
> le backlog restant vivent dans `PLAN-MVP-BETA.md`** (racine, plan vivant unique) + la mémoire
> auto `v1-etat-courant.md`. Les plans d'exécution `KICKOFF-BLOCS-B-H.md` et `HANDOFF_V2.md` sont
> **archivés/figés** (bannière ⛔ en tête) ; les plans terminés sont dans `docs/_archive/`.

**État : MVP cohérent de bout en bout.** Séquence Blocs A→H livrée + `PLAN-COHERENCE-MVP`
(chantiers 1→6.1) livré & mergé. La **fondation CRM (Bloc A) reste SCELLÉE** (jamais reshapée).

**Séquence canonique (ADR 0012) — livrée :**
- ✅ **Bloc 0** Gouvernance · ✅ **Bloc A** Fondation CRM v1.0 SCELLÉE (migrations 0009→0019)
- ✅ **Bloc B** — Doc (classif live validée, file de validation)
- ✅ **Bloc C** — Calendar (génération échéances, relances, UI)
- ✅ **Bloc D** — Microsoft Graph (OAuth + wrapper + webhooks + envoi) — ⚠️ validé contre **mocks** ; E2E sur vrai tenant = pré-requis bêta (cf. `PLAN-MVP-BETA.md`)
- ✅ **Bloc E** — Facture (QR-bill + extraction IA en cascade ADR 0024 + export)
- ✅ **Bloc F** — onboarding-client + dashboard-client (portail `/espace`)
- ✅ **Bloc G** — Salaire (workflow, PAS de calcul de paie)
- ◑ **Bloc H** — embeddings/pgvector + Search : indexation RAG + recherche sémantique **livrées** ; agrégations avancées non câblées
- ◑ **Phase I** — Chiffrement au repos : IBAN/AVS de **facture, salaire, et IBAN-du-QR** déjà au **Vault** ; ⚠️ restent SANS write-path `crm.relation.iban_facturation`, `crm.banque.iban`, `crm.param_comptable.acces_logiciel_externe` (à basculer Vault au 1er write-path — ADR 0013)

**Reste avant bêta (hors code, cf. `PLAN-MVP-BETA.md` § Horizon 2 + Suivi audit)** : setup app
Azure réelle + validation E2E Microsoft ; écran `/parametres/integrations` ; DPA + CGU ; nettoyage
du bloc AWS mort dans `.env.local`.

**État des modules** :
- ✅ Fondation CRM (Bloc A) scellée — contrat de schéma stable, « jamais reshapé » (ADR 0012).
- ✅ **IA en prod** : `EXTRACTION_MODE=live` (classification), activable par cabinet (ADR 0023) ; repli `StubClassifier` si l'appel live échoue (le document n'est jamais perdu).
- ✅ OCR texte natif + OCR **vision** Infomaniak + **embeddings/RAG** : code câblé et live (`IK_MODEL_*` posés sur Vercel). [L'ancienne mention « vision/embeddings différés/bloqués » est PÉRIMÉE.]

**Règles de périmètre (toute nouvelle feature / table)** :
- Un sujet cohérent = une PR ; DoD universel respecté ; arbitrages `⚠️` tranchés par le founder **avant** de coder (ne pas inventer une convention non documentée).
- **Ne jamais toucher au Bloc A** (`crm.*` scellé).
- IA via **Infomaniak** uniquement (catégories, pas de `model_id` en dur).
- Toute nouvelle table métier : DoD complet (migration additive + RLS + triggers + `METIER_TABLES`/`RLS_TABLES` + tests isolation **et** anti-fuite, bloquants CI) + **zéro FK fantôme**.
- Toute nouvelle colonne ultra-sensible (IBAN/AVS/token/secret) : inscrite au registre anti-clair `tests/integration/anti-plaintext/sensitive-columns.ts` (Vault par défaut). Idem toute trace d'audit pouvant contenir un IBAN/AVS : caviarder via `redactSensitiveForAudit` (ADR 0013).

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
