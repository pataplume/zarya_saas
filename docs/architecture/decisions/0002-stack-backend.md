---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [stack, dev-environment]
---

# ADR 0002 — Stack backend Next.js + TypeScript end-to-end

## Statut
Acceptée — 26 mai 2026

## Contexte

Choix du langage et framework backend pour ZARYA. Décision structurante :
- Détermine les compétences de l'équipe dev
- Conditionne l'écosystème de libs disponibles
- Impacte la vélocité de développement
- A des implications de coûts (hosting, dev time)

Options évaluées :

1. **Next.js 15+ (TypeScript end-to-end)** : monorepo unique, App Router, Server Components
2. **Next.js frontend + FastAPI backend (Python)** : séparation classique JS/Python
3. **Next.js frontend + NestJS backend (TypeScript)** : séparation mais même langage
4. **SvelteKit + Hono (TypeScript)** : alternative Svelte
5. **Remix + Express** : alternative Remix

## Décision

**Stack monolithique Next.js 15+ avec TypeScript end-to-end.**

Pas de séparation frontend/backend distincte au MVP. L'application est un **modulith** Next.js où :
- Le frontend utilise React Server Components (RSC) + Client Components
- Le backend est constitué de Route Handlers + Server Actions
- La logique métier est partagée dans `/packages` (workspace pnpm)

Migration vers un découpage en services possible plus tard si nécessaire (peu probable < 100 cabinets).

## Raisons

### Pourquoi Next.js
- **Industrie standard** en 2026 pour les SaaS B2B modernes
- **Écosystème mature** : auth, DB, déploiement, monitoring tout disponible
- **Vercel intégration native** (déploiement, edge functions, preview)
- **App Router** : architecture moderne avec RSC pour performance
- **Server Actions** : mutations type-safe sans définir d'API REST
- **Streaming SSR** : meilleure UX (premier paint rapide)
- **Communauté massive** : recrutement facilité, ressources abondantes

### Pourquoi TypeScript end-to-end
- **Type safety** : du formulaire HTML jusqu'à la query Postgres
- **Schémas partagés** : Zod côté frontend et backend, source unique de vérité
- **Refactoring sûr** : changer un champ propage les erreurs partout
- **Productivité** : moins de bugs runtime, meilleur DX (autocomplétion, navigation)
- **Talent pool en Suisse** : développeurs TypeScript abondants

### Pourquoi modulith et pas microservices
- **Petite équipe** : 1-3 devs initialement, microservices = surcoût opérationnel énorme
- **Pas de scaling extrême** : 100 cabinets = traffic gérable par un seul service
- **Itérations rapides** : pas de coordination cross-service à chaque feature
- **Refactoring possible** : passer en microservices plus tard si vraiment nécessaire

## Conséquences

### Positives
- **Vélocité MVP** : tout est en place, déploiement en quelques heures
- **DX excellent** : auto-completion, refactoring, debugging unifié
- **Coût d'hébergement faible** : Vercel pro suffit jusqu'à plusieurs centaines de cabinets
- **Onboarding dev rapide** : stack standard, courbe d'apprentissage faible
- **Type safety partout** : moins de bugs en prod
- **Bibliothèques riches** : tout l'écosystème npm disponible

### Négatives
- **Pas idéal pour le compute intensif** : si on a besoin de calculs lourds (ex. processing vidéo), Node n'est pas optimal
- **Vendor lock-in Vercel** : possible, mais Next.js peut tourner partout (ECS, self-hosted)
- **Limites Server Actions** : pas adapté à toutes les opérations (webhooks, gros fichiers nécessitent Route Handlers)
- **Compétences spécialisées** : React Server Components est encore jeune, courbe d'apprentissage pour devs habitués au full client-side

### Neutres
- Code TypeScript se déploie sur Edge ou Node selon le besoin
- Pas de Python pour ML/data science (mais Bedrock fait tout le ML lourd, pas besoin de Python)

## Alternatives écartées

### Pourquoi pas FastAPI (Python) ?
- **Avantages perdus** : écosystème ML/data riche
- **Coûts** : 2 langages = 2 stacks à maintenir, séparation API/frontend = duplication des types
- **Compétences** : doubler le pool de devs nécessaires (Python + JS)
- **Pas de gain réel** : Bedrock fait le ML, on n'a pas besoin de scikit-learn/pandas en prod
- Pertinent si on faisait du ML on-prem, mais on consomme Bedrock externe

### Pourquoi pas NestJS ?
- Sur-architecture pour un MVP : decorators, modules, providers
- Verbosité accrue
- Plus adapté aux enterprises avec besoins de structure stricte
- Next.js Route Handlers + Server Actions sont suffisants

### Pourquoi pas SvelteKit ?
- Communauté plus petite que React/Next
- Moins de libs métier disponibles (UI kits, auth helpers)
- Recrutement plus difficile en Suisse
- Pertinent comme stack alternative, pas comme stack principale d'un produit B2B

### Pourquoi pas Remix ?
- Remix a été racheté par Shopify, futur incertain
- Communauté plus petite que Next
- Moins de momentum
- À revoir si Remix devient un acteur majeur

## Risques mitigés

### Limites du modulith à grande échelle
**Mitigation** : architecture modulaire interne (`/packages` séparés) qui faciliterait une extraction en services si nécessaire. Réversibilité préservée.

### Évolutions disruptives Next.js
**Mitigation** : suivre les LTS, ne pas adopter les features bleeding edge. Vercel maintient une bonne backward compatibility.

### Vendor lock-in Vercel
**Mitigation** : Next.js est open source et tourne partout. Migration possible vers ECS / autre Node hosting si besoin.

### Server Components encore jeunes
**Mitigation** : utiliser de manière conservative, pair programming sur les patterns avancés, monitoring des breaking changes.

## Conditions de révision

À reconsidérer si :
- Limites de performance avérées du modulith (peu probable < 1000 cabinets)
- Besoin émergent de stack ML (mais on a Bedrock externe)
- Évolution réglementaire bloquant Vercel en UE
- Communauté Next.js décline significativement

## Implémentation

Voir :
- [`/docs/architecture/stack.md`](../stack.md) — vue d'ensemble technique
- [`/docs/architecture/dev-environment.md`](../dev-environment.md) — setup pratique

## Liens connexes

- ADR 0004 — Supabase vs self-hosted (compatible avec Next.js)
- ADR 0005 — Multi-tenant natif (implémenté via RLS Supabase + helpers Next.js)
