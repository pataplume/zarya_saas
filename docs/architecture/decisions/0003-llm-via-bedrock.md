---
status: superseded
superseded_by: 0010
date: 2026-05-26
deciders: [tristan]
referenced_by: [llm-strategy, data-residency]
---

# ADR 0003 — Tous les appels LLM passent par Amazon Bedrock (eu-central-1)

> ⚠️ **REMPLACÉE par l'[ADR 0010](0010-llm-via-infomaniak.md)** (29 mai 2026) : la
> couche IA passe désormais par Infomaniak AI Services (souveraineté suisse). Bedrock
> n'a jamais été câblé en prod (le `BedrockClassifier` était un stub qui throw). Cette
> ADR est conservée pour l'historique de décision.

## Statut
~~Acceptée — 26 mai 2026~~ → **Remplacée par l'ADR 0010 le 29 mai 2026**

## Contexte

ZARYA utilise massivement des LLM (extraction d'employés, classification de documents, extraction de factures, RAG Search, génération d'emails). Cible commerciale : cabinets fiduciaires suisses, soumis au secret fiscal (art. 320 CP) et à la nLPD.

Options évaluées pour le provider LLM :

1. **API Anthropic directe** : la plus simple, mais résidence des données moins claire, DPA standard Anthropic, moins d'options de contrôle d'accès.
2. **Amazon Bedrock (eu-central-1)** : résidence stricte Allemagne, DPA AWS conforme RGPD Article 28, IAM granulaire, CloudTrail, KMS, certifications (SOC 2, ISO 27001, C5).
3. **Azure AI Foundry (Switzerland North)** : résidence physique Suisse, mais Claude pas disponible sur toutes les régions Azure, complexité d'intégration accrue.
4. **OpenAI / Mistral chat / autres** : qualité moindre que Claude sur nos cas d'usage (extraction structurée, multilingue suisse).

## Décision

**Tous les appels LLM de ZARYA passent par Amazon Bedrock en région `eu-central-1` (Frankfurt), sans exception.**

Modèles utilisés : famille Claude (Sonnet 4.6/4.7 pour qualité, Haiku 4.5 pour volume).

Aucun appel direct à l'API Anthropic, OpenAI, ou autre provider depuis le code ZARYA, en production comme en développement.

## Conséquences

### Positives
- **Conformité RGPD/nLPD** par construction (Allemagne = pays adéquat)
- **Auditabilité forte** via CloudTrail (logs de 6+ ans)
- **Sécurité** : IAM granulaire, pas de clé API, KMS pour le chiffrement
- **Certifications AWS** mobilisables en argument commercial
- **Argument de vente** vis-à-vis des cabinets exigeants : "Vos données restent en UE, dans une infrastructure certifiée SOC 2 / ISO 27001"
- **Chaîne contractuelle solide** : DPA AWS + DPA ZARYA → cabinet

### Négatives
- **Coût légèrement supérieur** à l'API Anthropic directe (~10-15% selon les modèles)
- **Complexité opérationnelle accrue** : compte AWS, IAM, monitoring CloudWatch
- **Latence ajoutée** : +200-500ms vs API directe (négligeable pour batch, sensible pour temps réel)
- **Cabinets exigeant strictement la Suisse** : 10-20% du marché potentiel exclu (mitigé par option Phase 2 Azure Switzerland North)
- **Dépendance AWS** : verrouillage écosystème, migration future coûteuse
- **Latence des nouvelles versions** : un nouveau modèle Claude peut prendre quelques semaines pour arriver sur Bedrock après son lancement

### Neutres
- Nécessite un wrapper d'abstraction interne pour découpler le code métier de l'SDK AWS
- Cross-region inference Bedrock désactivé (contrôle strict de la région)
- Pas de fallback vers d'autres providers en cas d'incident (conformité avant disponibilité)

## Alternatives écartées et pourquoi

### Pourquoi pas l'API Anthropic directe ?
- Résidence des données moins claire (mix US/EU selon configuration)
- Moins d'options de logging/audit que CloudTrail
- DPA standard Anthropic acceptable mais moins complet que AWS

### Pourquoi pas Azure AI Foundry Switzerland North ?
- Disponibilité Claude variable (certains modèles uniquement US/EU au launch)
- Complexité d'intégration plus élevée
- Coûts potentiellement plus élevés
- Mais : à reconsidérer en Phase 2 pour les cabinets exigeant Suisse stricte

### Pourquoi pas multi-provider (Bedrock + Azure + ...) ?
- Complexité opérationnelle disproportionnée au MVP
- Pas de besoin de failover au MVP (Bedrock SLA 99.9% suffisant)
- Risque de fragmenter la qualité de prompts entre providers

## Conditions de révision

Cette décision sera reconsidérée si :
- AWS retire massivement des modèles Claude (improbable)
- 30%+ des prospects refusent l'hébergement Allemagne (signal commercial fort)
- Anthropic propose une offre EU directe avec garanties équivalentes
- Volume permet de négocier un contrat enterprise direct avec Anthropic à conditions plus favorables (>1M USD/an typiquement)

## Implémentation

Voir [`/docs/architecture/llm-strategy.md`](../llm-strategy.md) pour la mise en œuvre concrète.

Voir [`/docs/architecture/data-residency.md`](../data-residency.md) pour le contexte global de résidence des données.
