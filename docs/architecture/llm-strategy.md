---
status: draft
owner: tristan
last_updated: 2026-05-29
domain: architecture
depends_on: [data-residency, decisions/0010-llm-via-infomaniak]
referenced_by: [salaire-onboarding, salaire, doc, facture, search]
---

# Stratégie LLM — Infomaniak AI Services (souveraineté suisse)

## 1. Décision fondatrice

**Toute la couche IA/LLM de ZARYA passe par Infomaniak AI Services** (société suisse, infrastructure suisse), via une API OpenAI-compatible. Sans exception, en production comme en développement.

Aucun appel direct à l'API Anthropic, OpenAI, Mistral La Plateforme, Amazon Bedrock, etc. depuis le code ZARYA. Seul Infomaniak est autorisé pour les inférences IA (chat, vision/OCR, embeddings).

Base URL : `https://api.infomaniak.com/2/ai/{product_id}/openai/v1`.

Voir [`ADR 0010`](./decisions/0010-llm-via-infomaniak.md) pour le contexte de cette décision. Cette décision **remplace ADR 0003** (LLM via Bedrock), conservée comme archive historique.

## 2. Pourquoi Infomaniak

### 2.1 Souveraineté juridictionnelle (au-delà de la résidence)
- Infomaniak est une **société suisse** opérant une **infrastructure en Suisse** : la couche d'inférence IA n'est pas seulement *résidente* en UE, elle relève d'un **opérateur suisse** non soumis au CLOUD Act américain
- Pour des fiduciaires suisses traitant des données salariales et fiscales sensibles, cela répond à l'exigence de **souveraineté juridictionnelle** sur la partie analyse de documents
- **Pas d'entraînement** sur les données client (engagement contractuel Infomaniak)
- Les documents ne quittent jamais la Suisse pour être analysés par les modèles
- Conformité nLPD / RGPD : la Suisse est un **pays adéquat** ; pas de transfert problématique pour la couche IA

> ⚠️ **Périmètre de la souveraineté** : cet engagement couvre la **couche d'inférence IA**. La base de données (Supabase, hébergée sur AWS eu-central-2 à Zurich, Suisse) et l'hébergement applicatif (Vercel, fra1 à Frankfurt, UE) sont opérés par des sociétés US (exposition CLOUD Act au niveau de l'opérateur, indépendamment de la région). On ne revendique donc **pas** une chaîne « 100 % souveraine end-to-end ». Formulation approuvée côté produit/marketing : « IA 100 % suisse et souveraine (Infomaniak) : vos documents ne quittent jamais la Suisse pour être analysés. »

### 2.2 Auditabilité
- Chaque inférence est tracée côté ZARYA dans `extraction.invocation` (modèle, tokens, latence, statut, coût, `client_id`, `feature`)
- Conservation **6 ans minimum** côté ZARYA pour audit nLPD / fiscal
- L'`usage` retourné par l'API (tokens input/output) sert de base à l'estimation de coût et à la facturation interne

### 2.3 Chiffrement
- TLS en transit jusqu'à l'API Infomaniak
- Données envoyées au modèle uniquement le temps du traitement, pas de stockage long terme côté Infomaniak

### 2.4 Secrets serveur uniquement
- Authentification par token (`IK_API_TOKEN`) + identifiant produit (`IK_PRODUCT_ID`), **secrets serveur uniquement**
- Jamais exposés côté client ; `pino redact` masque le token dans tous les logs
- Catalogue de modèles **lu au runtime** (`GET /v1/models`), aucun `model_id` codé en dur

## 3. Modèles utilisés

### 3.1 Mapping par catégorie

Aucun `model_id` n'est codé en dur. Les ids sont **lus au runtime** via `GET /v1/models` et mappés par **catégorie** logique. Le catalogue Infomaniak est en **Beta** : les ids ci-dessous sont les valeurs *actuellement* observées, pas des constantes.

| Catégorie | Usage | `model_id` actuel (lu au runtime) | Justification |
|---|---|---|---|
| `chat_small` | Classification documents (Doc), génération d'emails de relance, suggestions de catégorisation CRM | `mistralai/Ministral-3-14B-Instruct-2512` | Volume, rapide, bon marché |
| `chat_large` | Extraction onboarding (employés), extraction factures, RAG Search | `Qwen/Qwen3.5-122B-A10B-FP8` | Qualité critique, données nominatives / financières, synthèse complexe |
| `embeddings` | Indexation vectorielle (RAG, Phase 4.1+) | `bge_multilingual_gemma2` | Multilingue (FR/DE/IT), souveraineté |
| `vision` | OCR / vision sur documents scannés (Phase 4.1+) | à vérifier (Phase 4.1+) | Lecture de documents images |
| `reranker` | Reranking RAG (Phase 4.1+) | à vérifier (Phase 4.1+) | Pertinence des chunks |

⚠️ Catalogue Infomaniak en Beta : les noms exacts évoluent. La résolution passe toujours par `resolveModel(category)` (voir § 4), jamais par une constante en dur.

### 3.2 Politique de mise à jour des modèles
- Test des nouvelles versions de modèles sur un **set d'évaluation interne** (50-100 documents anonymisés) avant bascule
- Mise à jour des modèles **planifiée**, pas automatique
- Champ `modele_version_exacte` stocké à chaque inférence pour reproductibilité

### 3.3 Résolution dynamique
Les ids étant lus via `GET /v1/models`, ZARYA garde un **contrôle strict** sur la catégorie utilisée par feature, tout en restant robuste aux renommages du catalogue Beta.

## 4. Architecture d'intégration

### 4.1 Client OpenAI-compatible

L'API Infomaniak est OpenAI-compatible. ZARYA l'enveloppe dans un **wrapper unique** sous `packages/integrations/infomaniak/`, qui instancie un client OpenAI pointé sur la base URL Infomaniak :

```typescript
// packages/integrations/infomaniak/client.ts
import OpenAI from 'openai';

const ik = new OpenAI({
  baseURL: `https://api.infomaniak.com/2/ai/${process.env.IK_PRODUCT_ID}/openai/v1`,
  apiKey: process.env.IK_API_TOKEN, // secret serveur uniquement, jamais côté client
});
```

`IK_PRODUCT_ID` et `IK_API_TOKEN` sont des **secrets serveur** (variables d'env en dev, Supabase Vault en prod). `pino redact` masque `IK_API_TOKEN` et les en-têtes `authorization` dans tous les logs.

### 4.2 Résolution de modèle par catégorie
Aucun `model_id` codé en dur. Un helper `resolveModel(category)` lit le catalogue via `GET /v1/models` (avec cache court) et renvoie l'id concret pour une catégorie logique (`chat_small`, `chat_large`, `embeddings`, `vision`, `reranker`) :

```typescript
// packages/integrations/infomaniak/resolve-model.ts
export async function resolveModel(category: ModelCategory): Promise<string> {
  const models = await ik.models.list(); // GET /v1/models
  // mapping catégorie → id concret du catalogue Beta
  return pickByCategory(models, category);
}
```

### 4.3 Output structuré
- Extraction et classification utilisent `response_format: { type: "json_schema" }` (vérifié fonctionnel sur l'API Infomaniak)
- `response_format: { type: "json_object" }` est **rejeté** par l'API — ne pas l'utiliser
- `temperature: 0` pour l'extraction (déterminisme), schéma Zod en sortie pour le parsing

**Règle de revue de code** : tout appel IA en dehors de `packages/integrations/infomaniak/` (et des classifiers/extractors qui en dépendent) est rejeté. Pas d'import d'un SDK provider tiers (Bedrock, Anthropic, Mistral) dans le code ZARYA.

## 5. OCR / Vision : Infomaniak (Phase 4.1+)

L'OCR et la vision sur documents scannés passeront par les **modèles vision d'Infomaniak** (catégorie `vision`), via la même API OpenAI-compatible.

> ⚠️ **Non construit au MVP** : la couche vision/OCR est différée en **Phase 4.1+** (modules Facture/Search pas encore construits). Le `model_id` vision reste **à vérifier** dans le catalogue Beta. La Phase 4.0 ne couvre que la **classification** (`chat_small`).

**Pipeline type (cible Phase 4.1+)** :
```
Document PDF/image → Infomaniak vision (Suisse) → texte structuré
                  → Infomaniak chat_large (Suisse) → extraction sémantique
```

Toute la chaîne reste sur l'infrastructure Infomaniak en Suisse.

## 6. Prompts versionnés

### 6.1 Stockage
Les prompts système sont **versionnés dans le code source** au MVP (sous `/lib/llm/prompts/`), pas en DB. Raisons :
- Facilité de review en pull request
- Versionnage Git natif
- Pas de risque de modification accidentelle en prod
- Rollback simple

Évolution possible en Phase 2 : si des **prompts spécifiques par cabinet** deviennent nécessaires (ex. cabinet avec ses propres modèles d'emails), basculer en DB avec table dédiée.

### 6.2 Structure d'un prompt
Chaque prompt est typé en TypeScript :

```typescript
export const ONBOARDING_EXTRACTION_EMPLOYE = {
  version: 'v1.2.0',
  modelCategory: 'chat_large', // résolu au runtime via resolveModel(), pas d'id en dur
  system: `Tu extrais des données employés pour un onboarding fiduciaire suisse...`,
  schema: z.object({ ... }), // Zod schema pour parsing + response_format json_schema
  maxTokens: 4096,
  temperature: 0
};
```

Chaque appel inclut la **version du prompt** stockée dans `extraction_ia.prompt_version` pour audit et A/B testing.

### 6.3 Évaluation continue
Toute modification de prompt → passage sur le **set d'évaluation** (jeu de 50-100 cas annotés) avant déploiement. Métriques mesurées :
- Précision champ par champ
- Taux d'hallucination (champs inventés)
- Coût moyen en tokens

## 7. Logging et observabilité

### 7.1 Ce qui est loggué
À chaque appel IA :
- `bedrock_request_id` (colonne legacy conservée sans renommage ; stocke désormais l'id de requête Infomaniak quand disponible)
- `model_id` exact (id concret résolu au runtime)
- `model_category` (`chat_small` / `chat_large` / `embeddings` / `vision`)
- `prompt_version` (référence interne ZARYA)
- `tokens_input`, `tokens_output` (depuis le champ `usage` de la réponse Infomaniak)
- `cost_estime_chf` (calculé depuis l'`usage` et le pricing Infomaniak)
- `latence_ms`
- `statut` (succès / échec / timeout)
- `client_id` concerné (pour facturation et audit)
- `feature` (onboarding / facture / search / etc.)

Stocké dans `extraction.invocation`.

### 7.2 Observabilité
Dashboard avec :
- Volume d'appels par feature
- Coût quotidien / hebdomadaire / mensuel
- Latence p50 / p95 / p99
- Taux d'erreur
- Top 10 des clients consommateurs (détection d'usage anormal)

### 7.3 Alertes
- Coût quotidien > seuil → alerte Slack/email
- Latence p95 > 10s → alerte
- Taux d'erreur > 5% → alerte
- Modèle indisponible (région down) → alerte critique

## 8. Estimation des coûts

### 8.1 Coûts par feature (ordre de grandeur)

Pour 1 cabinet fiduciaire / 50 clients / mois (estimation MVP, à recalibrer) :

| Feature | Volume mensuel | Modèle | Coût estimé/mois |
|---|---|---|---|
| Onboarding (initial 1 fois) | 50 clients × 5 employés = 250 extractions | `chat_large` | ~25 CHF (one-shot) |
| Classification documents Doc | 1500 docs | `chat_small` | ~5 CHF |
| Extraction factures | 800 factures | `chat_large` | ~40 CHF |
| Pré-remplissage salaire mensuel | 50 périodes | `chat_small` | ~3 CHF |
| Génération emails relance | ~100 | `chat_small` | ~1 CHF |
| Search RAG | ~200 requêtes | `chat_large` | ~10 CHF |
| **Total mensuel récurrent** | | | **~60 CHF / cabinet** |
| Onboarding one-shot par cabinet | | | ~25 CHF |

Pour 10 cabinets : ~600 CHF/mois récurrent. Pour 100 cabinets : ~6000 CHF/mois.

**Marge vs pricing client** : si tu factures 300-500 CHF/cabinet/mois, le coût LLM représente 15-20% du chiffre d'affaires. Acceptable mais pas négligeable.

⚠️ Confiance ~50% sur ces estimations — vrais coûts à mesurer en pilote sur 3-5 cabinets pendant 3 mois.

### 8.2 Optimisations possibles
- **Choix de catégorie** : router systématiquement les tâches simples vers `chat_small` plutôt que `chat_large` (gros levier de coût).
- **Compression de contexte** : pour le RAG, mesurer si on peut envoyer moins de chunks sans dégrader la qualité.
- **Caching / batch** : à évaluer selon les capacités offertes par le catalogue Infomaniak (catalogue Beta — fonctionnalités à confirmer).

## 9. Gestion d'erreurs et fallback

### 9.1 Retry logic
- Erreurs **5xx** : retry exponentiel (1s, 2s, 4s, 8s, abandon)
- **Throttling / rate limit** (HTTP 429) : retry avec jitter
- **Validation** (HTTP 4xx de validation) : pas de retry, log + erreur applicative

### 9.2 Fallback en cas d'Infomaniak indisponible
Si l'API Infomaniak est indisponible :
- **Mode dégradé** : les workflows non critiques (suggestions, classifications) sont mis en attente
- **Mode critique** : pas de bascule vers un autre provider d'inférence
- Notification au gestionnaire fiduciaire
- File de traitement reprise dès qu'Infomaniak revient

⚠️ Pas de fallback vers une API US (Anthropic, OpenAI, Bedrock) : cela briserait la souveraineté suisse de la couche IA, fondement de la décision ADR 0010.

### 9.3 Timeouts
- Extraction onboarding : 60s max
- Classification : 10s max
- RAG : 30s max
- Génération email : 15s max

## 10. Sécurité des données envoyées au LLM

### 10.1 Données sensibles
**Avant tout appel LLM**, le code applicatif vérifie qu'on n'envoie pas :
- Numéros AVS complets si non nécessaires (masquage 756.XXXX.XXXX.**)
- IBAN complet si non nécessaires
- Mots de passe (jamais, évidemment)

Pour l'**extraction d'employés**, ces données sont **nécessaires** dans le contenu — pas de masquage. Mais le LLM les lit en input, ne les "apprend" pas (engagement contractuel Infomaniak : pas d'entraînement sur les données client).

### 10.2 Pas de transmission cross-cabinet
Un appel LLM contient toujours les données d'**un seul cabinet** à la fois. Pas de batch multi-cabinets (sauf pour les stats anonymisées internes ZARYA, hors scope produit).

### 10.3 Pas d'injection prompt
Tout contenu utilisateur (document extrait, message client) passé au LLM est :
- Encadré par des balises XML (`<document>`, `<user_message>`)
- Échappé pour éviter les injections de prompt système
- Limité en longueur (truncate au-delà du contexte du modèle)

## 11. Conformité contractuelle

### 11.1 Chaîne de DPA
- **Infomaniak ↔ ZARYA** : DPA Infomaniak pour la couche IA (Article 28 RGPD) — *à signer* (référence à confirmer)
- **ZARYA ↔ Cabinet fiduciaire** : DPA bilatéral mentionnant Infomaniak (IA) comme sous-traitant, aux côtés de Supabase (DB/Storage, sur AWS) et Vercel (hébergement app)
- **Cabinet fiduciaire ↔ Client final** : à la charge du cabinet, mais ZARYA fournit un **modèle** mentionnant ZARYA et ses sous-traitants (Infomaniak, Supabase, Vercel)

### 11.2 Sous-traitance et notification
Tout changement de sous-traitant majeur (passage à un autre provider, ajout d'OCR différent) déclenche :
- Notification aux cabinets clients
- Délai de 30 jours pour objection
- Documentation mise à jour dans `data-residency.md`

## 12. Évolution future

### Phase 4.1+
- Activation de la couche **vision/OCR** Infomaniak (catégorie `vision`)
- **Embeddings** (`bge_multilingual_gemma2`) + pgvector pour le RAG, puis **reranker**
- Modèles spécialisés par usage selon ce que propose le catalogue Infomaniak

### Plus tard
- Évaluation continue des nouveaux modèles ajoutés au catalogue Infomaniak (Beta → GA)
- Optimisations de coût (caching/batch) si offertes par Infomaniak

## 13. Hors-scope
- Tout provider d'inférence non-Infomaniak (Anthropic, OpenAI, Bedrock, Mistral La Plateforme) : **interdit**
- Vision/OCR, embeddings, RAG, reranker : différés **Phase 4.1+** (Phase 4.0 = classification uniquement)
- Streaming en temps réel : OK techniquement, pas un besoin UX au MVP

## 14. Questions ouvertes
- [ ] **DPA Infomaniak** : référence et URL du DPA à confirmer ; signature avant production
- [ ] **Certifications Infomaniak** : SOC 2 / ISO 27001 à vérifier et documenter
- [ ] **Quotas / rate limits** : suffisants pour 100 cabinets ? (catalogue Beta)
- [ ] **`model_id` vision et reranker** : à vérifier dans le catalogue dès la Phase 4.1
- [ ] **Latence depuis l'app** : tester en pilote la latence end-to-end (UI → Backend → Infomaniak → réponse) sur extraction onboarding
- [ ] **Données d'évaluation** : où stockés les jeux de test annotés (Git LFS, bucket séparé) ?
- [ ] **Cas des données salariales nominatives** : chiffrement côté app **avant** envoi à Infomaniak ? Pas faisable pour l'extraction, mais à discuter pour d'autres usages.
