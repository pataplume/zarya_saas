---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [data-residency, multi-tenant, llm-strategy, security-and-audit, microsoft-integration, zefix-integration]
---

# ADR 0001 — Résidence des données en UE (Allemagne)

## Statut
Acceptée — 26 mai 2026

## Contexte

ZARYA traite des données fiduciaires hautement sensibles : salaires nominatifs, IBAN, factures clients, déclarations fiscales. Ces données sont soumises à :
- **nLPD suisse** (en vigueur depuis le 1er septembre 2023)
- **RGPD européen** (employés frontaliers UE, clients ressortissants UE)
- **Secret professionnel fiduciaire suisse**

Le choix de la juridiction d'hébergement est **fondateur** : il conditionne la conformité de tout l'écosystème ZARYA. Reporter cette décision rendrait tous les choix techniques ultérieurs susceptibles d'être remis en question.

Options évaluées :

1. **Suisse stricte** : tous les services en Suisse (Azure Switzerland North ou clouds locaux comme Infomaniak)
2. **UE (Allemagne/France)** : services en eu-central-1 (Frankfurt) ou eu-west-3 (Paris)
3. **Multi-region** : choix par cabinet entre Suisse et UE
4. **États-Unis** : majorité des SaaS modernes (rejeté immédiatement, non-conforme nLPD pour données salariales)

## Décision

**Tous les services ZARYA stockent et traitent les données en UE, principalement à Francfort (eu-central-1).**

Pour le MVP : **eu-central-1 (Frankfurt)** comme région principale, avec quelques exceptions cadrées :
- **Mistral La Plateforme** : eu-west-3 (Paris) pour l'OCR
- **Microsoft Graph** : région du tenant Microsoft du cabinet (à vérifier, alerte si non-UE)
- **Vercel** : edge global, mais compute principal redirigé vers eu-central-1

Option **Suisse stricte** (Azure Switzerland North) sera proposée en **Phase 2** pour les cabinets exigeant une résidence physique en Suisse.

## Raisons

### Pourquoi UE et pas Suisse au MVP
- **AWS eu-central-1 est mature, riche en services** (Bedrock, Supabase, etc.). Azure Switzerland North et les clouds suisses sont plus limités en catalogue.
- **Bedrock disponible uniquement en eu-central-1** parmi les régions UE (pas en Suisse). Bedrock est notre choix fondamental pour les LLM (ADR 0003).
- **nLPD acceptable** : le PFPDT accepte l'UE comme équivalent en termes de protection. Pas de transfert de données nécessaire (UE = niveau de protection adéquat).
- **Coûts** : infra cloud suisse 30-50% plus chère qu'UE.
- **Performance** : eu-central-1 a une excellente latence depuis la Suisse (Frankfurt à 600km de Zurich).
- **Time-to-market** : choisir UE permet de démarrer immédiatement avec des services modernes.

### Pourquoi proposer Suisse stricte en Phase 2
- Certains gros cabinets ou cabinets sensibles politiquement (mandats étatiques) exigent **physiquement** une infrastructure en Suisse.
- Argument commercial fort sur le segment Enterprise.
- Possible techniquement avec Azure Switzerland North + adaptations.

### Pourquoi pas multi-region par cabinet au MVP
- Complexité opérationnelle élevée : 2 stacks à maintenir
- Coût d'infra doublé
- Pas de demande commerciale prouvée
- À envisager Phase 2/3 selon retours pilotes

## Conséquences

### Positives
- **Catalogue de services riche** : Bedrock, Supabase, Mistral, Stripe tous disponibles en UE
- **Conformité nLPD + RGPD** by design
- **Coûts maîtrisés** : infra UE moins chère que Suisse stricte
- **Performance optimale** depuis la Suisse romande
- **Argumentaire commercial clair** : "Vos données restent en UE, conformité totale"
- **Pas de surprise** d'ici à l'année 2 sur la résidence

### Négatives
- **Argument commercial moindre** vs cabinets très conservateurs ("Suisse > UE pour mes données")
- **Dépendance AWS** (mais c'est le cas de la quasi-totalité du SaaS moderne)
- **Devra documenter** la conformité auprès de chaque cabinet sceptique

### Neutres
- Microsoft Graph dépend du tenant du cabinet (vérification active à l'onboarding)
- Bedrock et Mistral utilisent des sous-traitants engagés contractuellement à la non-utilisation

## Alternatives écartées

### Pourquoi pas Suisse stricte au MVP ?
- Bedrock non disponible → blocage du choix LLM
- Catalogue Azure Suisse limité
- Surcoût d'infra significatif
- Justifié uniquement pour offre Enterprise (Phase 2+)

### Pourquoi pas multi-region MVP ?
- Complexité opérationnelle multipliée par 2
- Pas de demande commerciale validée
- À reporter Phase 2/3 selon retours pilotes

### Pourquoi pas US ?
- nLPD interdit le transfert hors UE/Suisse sauf garanties contractuelles complexes
- Risques liés au Cloud Act US sur données sensibles
- Argumentaire commercial désastreux auprès de fiduciaires suisses
- **Rejet immédiat sans discussion**

## Risques mitigés

### Cabinet exigeant résidence physique Suisse
**Mitigation** : option Suisse stricte en Phase 2 (Azure Switzerland North), argumentaire UE solide en attendant.

### Évolution réglementaire
**Mitigation** : monitoring nLPD + RGPD + jurisprudence européenne. Réversibilité possible (migration Suisse) si réglementation se durcit.

### Cloud Act US qui s'étendrait à AWS UE
**Mitigation** : monitoring juridique. Plan B documenté (migration Azure ou souverain européen comme OVH/Scaleway).

### Dépendance AWS
**Mitigation** : architecture modulaire qui permettrait une migration partielle. Supabase est self-hostable en théorie. Bedrock plus difficile à remplacer (à monitorer).

## Conditions de révision

À reconsidérer si :
- Le PFPDT durcit son interprétation de la nLPD vis-à-vis de l'UE
- Le Cloud Act US s'étend explicitement à AWS UE (risque connu mais non-actualisé en 2026)
- Demande client majeure pour Suisse stricte (5+ cabinets enterprise)
- Bedrock devient disponible en Suisse (alors le choix se reposera)

## Implémentation

Voir :
- [`/docs/architecture/data-residency.md`](../data-residency.md) — détail technique
- [`/docs/architecture/llm-strategy.md`](../llm-strategy.md) — pourquoi Bedrock EU
- [`/docs/architecture/security-and-audit.md`](../security-and-audit.md) — cadre conformité

## Liens connexes

- ADR 0003 — LLM via Bedrock (conséquence directe : Bedrock EU = eu-central-1)
- ADR 0005 — Multi-tenant natif (compatible avec résidence UE)
- ADR 0006 — Onboarding self-service (résidence transparente pour le user)
