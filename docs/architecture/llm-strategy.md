---
status: draft
owner: tristan
last_updated: 2026-05-26
domain: architecture
depends_on: [data-residency]
referenced_by: [salaire-onboarding, salaire, doc, facture, search]
---

# Stratégie LLM — Amazon Bedrock eu-central-1

## 1. Décision fondatrice

**Tous les appels LLM de ZARYA passent par Amazon Bedrock en région `eu-central-1` (Frankfurt).** Sans exception, en production comme en développement.

Aucun appel direct à l'API Anthropic, OpenAI, Mistral chat, etc. depuis le code ZARYA. Seul Bedrock est autorisé pour les inférences LLM.

Voir [`/docs/architecture/decisions/0003-llm-via-bedrock.md`](./decisions/0003-llm-via-bedrock.md) pour le contexte de cette décision.

## 2. Pourquoi Bedrock

### 2.1 Conformité RGPD et nLPD
- Région `eu-central-1` (Frankfurt) garantit la **résidence des données en UE**
- L'Allemagne bénéficie d'une **décision d'adéquation** suisse pour les transferts de données personnelles
- AWS fournit un **Data Processing Agreement** conforme RGPD Article 28
- **Pas d'entraînement** sur les données envoyées (engagement contractuel AWS)
- Certifications : SOC 2, ISO 27001, C5 (Allemagne), HIPAA, etc.

### 2.2 Auditabilité
- **CloudTrail** trace tous les appels Bedrock (qui, quand, quel modèle, quel volume)
- **CloudWatch Logs** pour les détails d'inférence
- Logs de **6 ans minimum** disponibles pour audit nLPD / fiscal

### 2.3 Chiffrement
- TLS 1.2+ en transit (imposé par AWS)
- Chiffrement au repos avec clés KMS **gérées par ZARYA**
- Possibilité de **clés client-managed (CMK)** pour les cabinets exigeants

### 2.4 IAM > clé API
- Authentification via **IAM roles**, pas de clé API à rotater/fuiter
- Policies fines (un modèle = un scope)
- Audit complet via IAM Access Analyzer

## 3. Modèles utilisés

### 3.1 Catalogue

| Usage | Modèle | Région | Justification |
|---|---|---|---|
| Extraction onboarding (employés depuis PDF/Excel) | `anthropic.claude-sonnet-4-6-20260101-v1:0` | eu-central-1 | Qualité critique, données nominatives |
| Extraction factures | `anthropic.claude-sonnet-4-6-20260101-v1:0` | eu-central-1 | Qualité financière + auditabilité |
| Classification documents (Doc) | `anthropic.claude-haiku-4-5-20251001-v1:0` | eu-central-1 | Volume, rapide, bon marché |
| RAG Search (réponses avec sources) | `anthropic.claude-sonnet-4-6-20260101-v1:0` | eu-central-1 | Synthèse complexe sur N documents |
| Mapping de champs (templates onboarding) | `anthropic.claude-haiku-4-5-20251001-v1:0` | eu-central-1 | Simple, à volume |
| Génération d'emails de relance | `anthropic.claude-haiku-4-5-20251001-v1:0` | eu-central-1 | Sortie courte, multilangue |
| Suggestions de catégorisation CRM | `anthropic.claude-haiku-4-5-20251001-v1:0` | eu-central-1 | Tâches simples |

⚠️ Niveau de confiance moyen sur les noms exacts des model_id Bedrock — à valider lors de l'implémentation. Les versions évoluent.

### 3.2 Politique de mise à jour des modèles
- Test des nouvelles versions Claude sur un **set d'évaluation interne** (50-100 documents anonymisés) avant bascule
- Mise à jour des modèles **planifiée**, pas automatique
- Conservation de l'ancienne version 30 jours pour fallback
- Champ `modele_version_exacte` stocké à chaque inférence pour reproductibilité

### 3.3 Cross-region inference
Bedrock propose le **cross-region inference** qui peut router automatiquement vers d'autres régions EU pour optimiser la latence et la disponibilité. **Désactivé chez ZARYA** : nous voulons un contrôle strict sur la région exacte pour la conformité.

## 4. Architecture d'intégration

### 4.1 Client AWS SDK

```typescript
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand,
  ConverseCommand 
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({
  region: 'eu-central-1',
  credentials: fromEnv() // IAM role en prod, credentials dev en local
});
```

### 4.2 Wrapper d'abstraction
Pour éviter de coupler le code métier au SDK AWS, ZARYA expose un **wrapper interne** :

```typescript
// /lib/llm/client.ts
export interface LlmClient {
  extract<T>(params: ExtractParams): Promise<T>;
  classify(params: ClassifyParams): Promise<string>;
  generateText(params: GenerateParams): Promise<string>;
  rag(params: RagParams): Promise<RagResponse>;
}

// /lib/llm/bedrock-client.ts (seule implémentation autorisée)
export class BedrockLlmClient implements LlmClient { ... }
```

**Règle de revue de code** : tout import direct de `@aws-sdk/client-bedrock-runtime` en dehors de `/lib/llm/` est rejeté.

### 4.3 Configuration IAM

```yaml
# Rôle IAM minimal pour le service ZARYA
Policies:
  - Effect: Allow
    Action:
      - bedrock:InvokeModel
      - bedrock:InvokeModelWithResponseStream
    Resource:
      - "arn:aws:bedrock:eu-central-1::foundation-model/anthropic.claude-sonnet-4-6-*"
      - "arn:aws:bedrock:eu-central-1::foundation-model/anthropic.claude-haiku-4-5-*"
    Condition:
      StringEquals:
        aws:RequestedRegion: eu-central-1
```

Pas de wildcard `bedrock:*`, pas d'accès aux modèles non listés. Sécurité par défaut.

## 5. OCR : Mistral La Plateforme (EU)

L'OCR (en amont du LLM pour les documents scannés) passe par **Mistral La Plateforme** en région UE.

| Critère | Mistral OCR |
|---|---|
| Région | Paris (EU) |
| Conformité RGPD | Native (entreprise française) |
| Qualité sur français/allemand/italien | Excellente |
| Coût | Compétitif |
| Latence depuis Frankfurt | < 100ms |

**Pas d'OCR via AWS Textract** au MVP : qualité inférieure sur le multilingue suisse, et complexité d'intégration accrue pour bénéfice marginal.

**Pipeline type** :
```
Document PDF/image → Mistral OCR (Paris) → texte structuré 
                  → Bedrock Claude Sonnet (Frankfurt) → extraction sémantique
```

Les deux services UE, latence ajoutée < 200ms.

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
  model: 'anthropic.claude-sonnet-4-6-20260101-v1:0',
  system: `Tu extrais des données employés pour un onboarding fiduciaire suisse...`,
  schema: z.object({ ... }), // Zod schema pour parsing
  maxTokens: 4096,
  temperature: 0.1
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
À chaque appel LLM :
- `bedrock_request_id` (pour CloudTrail)
- `model_id` exact
- `region` (toujours eu-central-1, mais loggué pour vérification)
- `prompt_version` (référence interne ZARYA)
- `tokens_input`, `tokens_output`
- `cost_estime_chf` (calculé depuis pricing AWS)
- `latence_ms`
- `statut` (succès / échec / timeout)
- `client_id` concerné (pour facturation et audit)
- `feature` (onboarding / facture / search / etc.)

Stocké dans `audit.llm_invocation` (nouveau schéma `audit.*` à créer).

### 7.2 CloudWatch
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
| Onboarding (initial 1 fois) | 50 clients × 5 employés = 250 extractions | Sonnet | ~25 CHF (one-shot) |
| Classification documents Doc | 1500 docs | Haiku | ~5 CHF |
| Extraction factures | 800 factures | Sonnet | ~40 CHF |
| Pré-remplissage salaire mensuel | 50 périodes | Haiku | ~3 CHF |
| Génération emails relance | ~100 | Haiku | ~1 CHF |
| Search RAG | ~200 requêtes | Sonnet | ~10 CHF |
| **Total mensuel récurrent** | | | **~60 CHF / cabinet** |
| Onboarding one-shot par cabinet | | | ~25 CHF |

Pour 10 cabinets : ~600 CHF/mois récurrent. Pour 100 cabinets : ~6000 CHF/mois.

**Marge vs pricing client** : si tu factures 300-500 CHF/cabinet/mois, le coût LLM représente 15-20% du chiffre d'affaires. Acceptable mais pas négligeable.

⚠️ Confiance ~50% sur ces estimations — vrais coûts à mesurer en pilote sur 3-5 cabinets pendant 3 mois.

### 8.2 Optimisations possibles
- **Prompt caching Bedrock** : Anthropic propose le cache des prompts système (jusqu'à -90% sur tokens d'input pour les prompts longs). Activable plus tard quand le volume justifie.
- **Batch API** : pour les traitements asynchrones (extraction d'onboarding en arrière-plan), Bedrock Batch divise le coût par ~2. Idéal pour les traitements non temps-réel.
- **Compression de contexte** : pour le RAG, mesurer si on peut envoyer moins de chunks sans dégrader la qualité.

## 9. Gestion d'erreurs et fallback

### 9.1 Retry logic
- Erreurs **5xx** : retry exponentiel (1s, 2s, 4s, 8s, abandon)
- **Throttling** (`ThrottlingException`) : retry avec jitter
- **Validation** (`ValidationException`) : pas de retry, log + erreur applicative

### 9.2 Fallback en cas de Bedrock indisponible
Si Bedrock eu-central-1 est down :
- **Mode dégradé** : les workflows non critiques (suggestions, classifications) sont mis en attente
- **Mode critique** : pas de fallback vers une autre région (conformité avant disponibilité)
- Notification au gestionnaire fiduciaire
- File de traitement reprise dès que Bedrock revient

⚠️ Pas de fallback vers l'API Anthropic directe : violerait la politique de résidence des données.

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

Pour l'**extraction d'employés**, ces données sont **nécessaires** dans le contenu — pas de masquage. Mais le LLM les lit en input, ne les "apprend" pas (engagement contractuel AWS).

### 10.2 Pas de transmission cross-cabinet
Un appel LLM contient toujours les données d'**un seul cabinet** à la fois. Pas de batch multi-cabinets (sauf pour les stats anonymisées internes ZARYA, hors scope produit).

### 10.3 Pas d'injection prompt
Tout contenu utilisateur (document extrait, message client) passé au LLM est :
- Encadré par des balises XML (`<document>`, `<user_message>`)
- Échappé pour éviter les injections de prompt système
- Limité en longueur (truncate au-delà du contexte du modèle)

## 11. Conformité contractuelle

### 11.1 Chaîne de DPA
- **AWS ↔ ZARYA** : DPA AWS Standard (Article 28 RGPD)
- **ZARYA ↔ Cabinet fiduciaire** : DPA bilatéral mentionnant AWS comme sous-traitant
- **Cabinet fiduciaire ↔ Client final** : à la charge du cabinet, mais ZARYA fournit un **modèle** mentionnant ZARYA et AWS

### 11.2 Sous-traitance et notification
Tout changement de sous-traitant majeur (passage à un autre provider, ajout d'OCR différent) déclenche :
- Notification aux cabinets clients
- Délai de 30 jours pour objection
- Documentation mise à jour dans `data-residency.md`

## 12. Évolution future

### v2 (Phase 2)
- Prompt caching Bedrock activé sur les prompts longs
- Batch API pour les extractions onboarding non temps-réel
- Modèles spécialisés par usage (ex. fine-tuning sur extraction de factures suisses)

### v3 (Phase 3+)
- Modèle propriétaire fine-tuné sur les données ZARYA (anonymisées)
- Option **Azure Switzerland North** pour les cabinets exigeant résidence Suisse stricte
- Self-hosted LLM open-source (Llama, Mistral) pour les classifications simples (réduction de coûts)

## 13. Hors-scope
- API Anthropic directe : **interdite**
- Modèles non-Anthropic sur Bedrock (Llama, Titan, Mistral via Bedrock) : pas au MVP
- Cross-region failover : pas au MVP
- Streaming en temps réel : OK techniquement, pas un besoin UX au MVP

## 14. Questions ouvertes
- [ ] **Pricing Bedrock vs API Anthropic** : différence exacte à vérifier sur calculatrice AWS
- [ ] **Quotas par défaut** : suffisants pour 100 cabinets ? Demander augmentation ?
- [ ] **Prompt caching** : disponible en eu-central-1 sur tous les modèles Claude ?
- [ ] **Latence depuis l'app** : tester en pilote la latence end-to-end (UI → Backend → Bedrock → réponse) sur extraction onboarding
- [ ] **Données d'évaluation** : où stockés les jeux de test annotés (Git LFS, S3 séparé) ?
- [ ] **Politique en cas de modèle obsolète** : si AWS retire un modèle, comment migrer en douceur ?
- [ ] **Cas des données salariales nominatives** : chiffrement côté app **avant** envoi à Bedrock ? Pas faisable pour l'extraction, mais à discuter pour d'autres usages.
