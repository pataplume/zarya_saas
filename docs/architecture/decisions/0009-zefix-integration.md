---
status: accepted
date: 2026-05-27
deciders: tristan
adr: 0009
supersedes: none
superseded_by: none
related: [0001-residence-donnees, 0005-multi-tenant-natif-mvp]
---

# ADR 0009 — Intégration Zefix via route handler serveur avec HTTP Basic Auth

## Contexte

ZARYA utilise l'API publique Zefix (registre du commerce suisse) pour pré-remplir les fiches cabinet et client lors des onboardings, et pour vérifier ponctuellement le statut d'entreprises.

À l'ouverture du compte API Zefix (mai 2026), trois éléments techniques structurants se confirment et nécessitent un ADR :

1. **L'authentification est HTTP Basic** (couple username/password), pas une clé API ni un token bearer comme initialement supposé dans la documentation produit.
2. **L'API ne supporte pas CORS** : aucun appel direct depuis le navigateur n'est possible.
3. **Le throttling implicite est strict** (≈ 1 requête/seconde recommandée par les wrappers communautaires), avec quotas journaliers non publiés.

Ces contraintes ont des conséquences architecturales suffisamment structurantes pour être actées dans un ADR : elles influencent la sécurité (où stocker les credentials), le pattern d'accès (route handler obligatoire, pas server action triviale), la performance (cache obligatoire dès le MVP) et le multi-tenant (les credentials sont uniques pour toute la plateforme, pas par cabinet).

## Décision

### 1. Authentification HTTP Basic, credentials côté serveur uniquement

- Les credentials Zefix sont stockés exclusivement côté serveur :
  - **Dev** : `.env.local` (gitignoré)
  - **Staging / Production** : Supabase Vault, exposés au runtime Next.js via variables d'environnement
- Les variables canoniques sont `ZEFIX_USERNAME`, `ZEFIX_PASSWORD`, `ZEFIX_BASE_URL`.
- Aucune référence à ces variables ne peut apparaître dans du code exécuté côté client (`use client`, composants navigateur).
- Les credentials sont **partagés pour toute la plateforme ZARYA** : un seul compte Zefix sert tous les cabinets. Le rate limiting est donc global, pas par tenant.

### 2. Pattern d'accès : route handler Next.js, jamais server action

Contrairement au pattern par défaut ZARYA ("Server Actions par défaut pour les mutations" — cf. `dev-environment.md`), l'intégration Zefix passe **exclusivement** par des route handlers (`/app/api/zefix/*`).

Raisons :
- CORS bloque tout appel direct depuis le navigateur : aucune autre option backend ne convient mieux
- Les server actions sont conçues pour les mutations sur des données ZARYA, pas pour proxifier une API tierce
- Le besoin d'auto-complétion implique des appels HTTP réguliers et indépendants, plus naturels en route handler
- L'audit, le throttling et le cache se centralisent proprement à ce niveau

Endpoints exposés :
- `POST /api/zefix/search` — recherche par nom
- `GET /api/zefix/uid/[uid]` — détail par IDE
- `GET /api/zefix/ehraid/[ehraid]` — détail par EHRAID

Chaque route handler :
1. Authentifie l'utilisateur (cookie Supabase)
2. Résout le `cabinet_id` (ou accepte `null` pour l'étape A onboarding fiduciaire uniquement)
3. Valide le body/params via Zod
4. Vérifie le consentement nLPD
5. Logue dans la table d'audit appropriée
6. Applique throttle puis cache
7. Délègue au package `@zarya/zefix`

### 3. Consentement nLPD opt-in (non pré-coché)

Les données Zefix sont publiques mais leur agrégation dans ZARYA active la nLPD. La checkbox de consentement est **non pré-cochée** par défaut. La saisie manuelle reste accessible sans consentement.

Cette décision révise la position précédente (checkbox pré-cochée par défaut) pour s'aligner sur les recommandations du préposé fédéral à la protection des données pour les collectes agrégées.

### 4. Cache Postgres au MVP, Redis si saturation

Le cache des réponses Zefix vit dans une table `cache.zefix_response` au MVP (TTL 1h pour recherche par nom, 24h pour détails par IDE). Migration vers Upstash Redis eu-central-1 seulement si la volumétrie ou la latence l'imposent. Critères de bascule à définir au pilote.

### 5. Package workspace dédié

L'intégration vit dans `/packages/integrations/zefix/`, séparé du code applicatif. API publique typée, schémas Zod pour la validation des réponses (defense in depth), classes d'erreur dédiées (`ZefixAuthError`, `ZefixRateLimitError`, etc.).

### 6. Logs d'appels scopés par cabinet et soumis aux RLS

Bien que les données interrogées soient publiques, les **logs d'appels** (`crm.zefix_recherche_cabinet`, `salaire.zefix_recherche`) sont des données métier scopées par cabinet et soumises aux RLS multi-tenant standard. Tests d'isolation obligatoires en CI.

## Alternatives considérées

### A. Server action wrappant l'appel Zefix
Rejeté. CORS n'est pas un problème pour les server actions (elles s'exécutent côté serveur), mais l'auto-complétion nécessite des appels indépendants depuis le client, et les server actions sont moins adaptées au streaming/débounce. Le pattern route handler est plus lisible pour une intégration tierce.

### B. Appel direct depuis le navigateur via proxy public
Rejeté. Toute exposition des credentials Zefix au client navigateur est inacceptable (compte partagé sensible). Même un proxy de type Cloudflare Worker public déplacerait le problème sans le résoudre.

### C. Clé API par cabinet
Rejeté car non disponible : Zefix ne propose qu'un couple username/password par compte demandeur. Pas de notion de sub-tenant.

### D. Pas de cache au MVP
Rejeté. Le throttle 1 req/s combiné à l'auto-complétion debounced rendrait l'expérience inutilisable sans cache. Le cache n'est pas une optimisation prématurée, c'est une contrainte du throttle Zefix.

### E. Cache Redis dès le MVP
Rejeté. Ajoute une dépendance infra (Upstash) pour un bénéfice marginal au volume MVP attendu (< 100 cabinets, ~quelques milliers d'appels/jour cumulés). Postgres suffit. Bascule planifiée si nécessaire.

## Conséquences

### Positives
- Sécurité : credentials jamais exposés au navigateur
- Conformité nLPD : consentement explicite tracé, audit complet
- Performance : cache réduit drastiquement la dépendance à Zefix et améliore la latence
- Résilience : si Zefix tombe, on continue à servir les données cachées
- Multi-tenant respecté pour les logs

### Négatives
- Légère complexité supplémentaire vs server action triviale
- Le throttle global (pas par tenant) peut créer une contention en cas de pic d'usage simultané — à monitorer
- Le cache Postgres nécessite un job de purge périodique
- Le `cabinet_id NULL` autorisé pour l'étape A onboarding fiduciaire est une exception au pattern multi-tenant pur — documentée, contrôlée, mais à surveiller

### Sécurité
- 401/403 Zefix doivent déclencher une alerte ops critique
- Les logs ne doivent jamais inclure le `Authorization` header dans la trace
- Pino redact configuré pour masquer `ZEFIX_PASSWORD` partout

### Migration
- ADR pris avant tout code Zefix : pas de migration nécessaire
- Variables d'environnement à ajouter au `.env.example` et au Vault de production
- Job de purge `cache.zefix_response` à ajouter au cron applicatif

## Références

- Doc d'architecture : [`zefix-integration.md`](../zefix-integration.md)
- Doc modules : [`onboarding-fiduciaire.md`](../../modules/onboarding-fiduciaire.md) § 5, [`onboarding-client.md`](../../modules/onboarding-client.md) § 5
- Schémas : [`onboarding-fiduciaire-schema.md`](../../data-model/onboarding-fiduciaire-schema.md) § 8, [`onboarding-client-schema.md`](../../data-model/onboarding-client-schema.md)
- ADR liés : 0001 (résidence données), 0005 (multi-tenant)
- Doc officielle Zefix : https://www.zefix.admin.ch/ZefixPublicREST/swagger-ui/index.html
- Contact API : `zefix@bj.admin.ch`
