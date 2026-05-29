---
status: accepted
date: 2026-05-29
deciders: [tristan]
supersedes: [0003]
referenced_by: [llm-strategy, data-residency]
---

# ADR 0010 — La couche IA passe par Infomaniak AI Services (souveraineté suisse)

## Statut
Acceptée — 29 mai 2026. **Remplace l'ADR 0003** (LLM via Amazon Bedrock).

## Contexte

L'ADR 0003 actait tous les appels LLM via Amazon Bedrock (eu-central-1) pour la
conformité RGPD/nLPD par **résidence** des données en Allemagne. À l'usage commercial,
deux constats changent la décision :

1. **La souveraineté juridictionnelle est notre blocage d'acceptation #1** auprès des
   fiduciaires suisses, pas la simple résidence géographique. Bedrock = Anthropic
   (modèle) + Amazon (infra) = **deux sociétés américaines**, donc soumises au CLOUD
   Act, même lorsque l'inférence tourne à Francfort. Résidence ≠ souveraineté.

2. **L'inférence LLM est le seul maillon où le chiffrement ne protège pas** : pour
   extraire un IBAN, un n° AVS ou un salaire, le modèle doit lire le contenu **en
   clair**. La seule parade au CLOUD Act sur ce maillon est *juridictionnelle* :
   aucune entité US dans la chaîne d'inférence.

3. **Le coût de bascule est faible.** L'API Infomaniak est compatible OpenAI ;
   l'abstraction interne (`Classifier`, et à terme `LlmClient`) était précisément
   conçue pour découpler le métier du fournisseur. On change l'implémentation, pas le
   métier.

Infomaniak (société suisse, infrastructure suisse) propose une offre « AI Services »
OpenAI-compatible couvrant chat, vision (OCR), embeddings et reranking.

> ⚠️ **Le catalogue IA d'Infomaniak est en Beta.** Pas de SLA fort, catalogue mouvant,
> parité OpenAI non garantie (JSON mode, function calling à vérifier par modèle).

## Décision

**Toute la couche IA de ZARYA (classement de documents, extraction, OCR vision, RAG /
Search, embeddings, emails, suggestions CRM) passe par Infomaniak AI Services.**
Anthropic, Amazon Bedrock et Mistral OCR sont retirés de la chaîne IA.

Règles d'implémentation non négociables :

- **Aucun `model_id` ni format codé en dur.** Les identifiants réels sont lus au
  runtime via `GET /v1/models`. Le mapping se fait **par catégorie** (`chat_small`,
  `chat_large`, `embeddings`, …), pas par nom de modèle, pour absorber les changements
  de catalogue Beta sans casser la prod.
- **Secrets côté serveur uniquement** (`IK_PRODUCT_ID`, `IK_API_TOKEN`) — jamais côté
  client, `pino redact` sur le token (cf. CLAUDE.md règle #7).
- **`temperature: 0`** pour l'extraction ; sortie structurée via
  `response_format: { type: "json_schema", … }` (**vérifié fonctionnel**, sonde du
  2026-05-29). ⚠️ `json_object` est **rejeté** par l'API Infomaniak (« no longer
  supported »). Conserver malgré tout un fallback de parsing si un modèle refusait
  `json_schema` (catalogue Beta).
- **Validation déterministe applicative renforcée en aval** (IBAN valide, total =
  Σ lignes, conformité de schéma) : la fiabilité vient autant des garde-fous
  applicatifs que du modèle.
- **`extraction.invocation`** reste la source de traçage (model_used réel,
  prompt_version, tokens, coût, durées, statut) — multi-tenant (`cabinet_id`).

Base URL : `https://api.infomaniak.com/2/ai/{product_id}/openai/v1`.

### Mapping catégorie → tâches (ids réels via `/v1/models`, jamais codés en dur)

Ids **vérifiés** au catalogue live (sonde du 2026-05-29). Le code mappe par
catégorie ; ces ids vivent en config (`IK_MODEL_*`), pas dans le code.

| Tâche | Catégorie | Avant (Bedrock) | Après (Infomaniak — id réel vérifié) |
|---|---|---|---|
| Classement / emails / CRM | `chat_small` | Claude Haiku 4.5 | `mistralai/Ministral-3-14B-Instruct-2512` |
| Extraction factures/employés, RAG | `chat_large` | Claude Sonnet 4.6 | `Qwen/Qwen3.5-122B-A10B-FP8` |
| OCR documents scannés (vision) | `vision` | Mistral OCR | à vérifier (Phase 4.1+) |
| Embeddings | `embeddings` | Bedrock (Titan/Cohere) | `bge_multilingual_gemma2` |
| Reranking | `reranker` | — | à vérifier (Phase 4.1+) |

> Sortie structurée **vérifiée** : `response_format: { type: "json_schema" }`
> fonctionne sur Ministral. `json_object` est **rejeté** par l'API.

### Séquencement (important)

La migration suit l'**existence réelle des modules**, pas la liste théorique :

- **Phase 4.0 (maintenant)** : seule la **classification de documents** est réellement
  branchée dans un pipeline. On câble `InfomaniakClassifier` (catégorie `chat_small`)
  derrière le flag existant `EXTRACTION_MODE`, le mode `stub` restant le défaut en prod
  jusqu'à validation chiffrée.
- **Phase 4.1+** : vision/OCR (quand le module Facture existe), embeddings + migration
  de dimension pgvector + backfill (quand le module Search existe — aujourd'hui 0
  embedding en base, donc rien à migrer), reranker. Les coder maintenant reviendrait à
  migrer des modules inexistants.

## Conséquences

### Positives
- **Souveraineté suisse réelle sur l'inférence** : aucune entité US ne lit les
  documents en clair. C'est l'argument d'acceptation #1 levé.
- **Aucune donnée utilisée pour entraîner des modèles** (engagement Infomaniak).
- **Coût attendu nettement inférieur** (ordre de grandeur ~5–15 CHF/cabinet/mois vs
  ~60–100 sur Claude/Bedrock) — bonus, pas le moteur de la décision.
- **Faible coût de bascule** : API OpenAI-compatible, SDK `openai` réutilisable.

### Négatives
- **Beta = instabilité** : catalogue mouvant, pas de SLA fort → nécessite lecture
  runtime de `/v1/models` et un mécanisme de fallback configurable.
- **Qualité à prouver** : les modèles open source doivent être validés sur nos cas
  suisses multilingues (FR/DE/IT) avant toute bascule en prod (golden set).
- **Parité non garantie** : JSON mode et function calling à vérifier par modèle.
  Apertus-70B n'a **pas** de function calling → exclu de l'extraction structurée par
  tool-calling.
- **Dépendance npm** : ajout du SDK `openai` (justifié : client OpenAI-compatible).

### Neutres / réserves
- **La base de données (Supabase/AWS) et l'app (Vercel) restent US-opérées.** On a
  donc une **résidence** suisse possible (région Zurich) mais pas une **souveraineté**
  complète de bout en bout. À traiter en Phase 2 si une exigence client signée le
  réclame. Conséquence directe sur le **wording** : ne pas écrire « 100 % souverain »
  ni « aucune entreprise américaine dans toute la chaîne » tant que DB + app sont
  US-opérées. Formulation honnête recommandée : « IA 100 % suisse et souveraine
  (Infomaniak) : vos documents ne quittent jamais la Suisse pour être analysés. »
- Publier la **liste des sous-traitants** (registre déjà prévu) ferme le débat mieux
  qu'un slogan.

## Alternatives écartées

- **Rester sur Bedrock (ADR 0003)** : résidence OK mais souveraineté KO (entités US) →
  ne lève pas le blocage d'acceptation.
- **API Anthropic / OpenAI directes** : entités US, même problème, en pire.
- **Azure Switzerland North** : résidence CH mais opérateur US (Microsoft) → même
  réserve juridictionnelle ; complexité supérieure.

## Conditions de révision

Cette décision sera reconsidérée si :
- Infomaniak abandonne ou dégrade durablement son offre AI Services ;
- l'instabilité Beta devient ingérable en prod sans fallback acceptable ;
- la qualité mesurée (golden set) reste insuffisante sur nos cas FR/DE/IT après
  itérations de prompt — auquel cas un fallback souverain alternatif serait évalué.

## Implémentation

Voir [`/docs/architecture/llm-strategy.md`](../llm-strategy.md) (à mettre à jour) et le
document de migration `zarya-migration-ia-infomaniak.md`.
Voir [`/docs/architecture/data-residency.md`](../data-residency.md) pour le contexte de
résidence/souveraineté des données.
