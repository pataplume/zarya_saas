---
status: validated
owner: tristan
last_updated: 2026-05-27
priority: P0
domain: architecture
depends_on: [data-residency, multi-tenant, security-and-audit]
referenced_by: [onboarding-fiduciaire, onboarding-client, crm]
---

# Intégration Zefix

## 1. Contexte

**Zefix** (Zentraler Firmenindex) est l'**index central des entreprises suisses**, géré par l'Office fédéral du registre du commerce (OFRC). Il agrège les données du registre du commerce de tous les cantons et expose une **API REST publique gratuite** à accès authentifié.

ZARYA utilise Zefix pour :
1. **Onboarding fiduciaire** : auto-remplir l'identité du cabinet à l'inscription
2. **Onboarding client** : auto-remplir l'identité du client final lors de l'ajout d'un nouveau client
3. **Mise à jour ponctuelle** des fiches client (changement d'IDE, vérification statut)

L'accès se demande par email à `zefix@bj.admin.ch` ; les credentials sont un couple **username / password** (pas une clé API).

## 2. Données disponibles via Zefix

### 2.1 Champs récupérables
- **Identité** : raison sociale, IDE (CHE-...), forme juridique
- **Adresses** : adresse(s) légale(s) du siège
- **Capital social** : montant, devise
- **Statut** : actif, en liquidation, radié
- **Dates** : inscription, modifications, radiation
- **Organes** : administrateurs, signataires, fondés de pouvoir (nom, qualité, droits de signature)
- **Buts statutaires** : description de l'activité
- **Cantons d'établissement**
- **Publications SOGC** (Feuille officielle suisse du commerce) liées à l'entreprise

### 2.2 Champs NON disponibles
- Numéro TVA actif (différent de l'IDE — il faut interroger l'AFC séparément)
- Coordonnées bancaires
- Contacts opérationnels (email, téléphone)
- Logiciels utilisés
- Données financières (chiffre d'affaires, bilan)
- Historique des modifications statutaires détaillé

### 2.3 Limites de couverture
- **Indépendants en raison individuelle** : pas obligés de s'inscrire au RC en dessous de 100 000 CHF de CA → potentiellement absents de Zefix
- **Associations** : seules celles avec activité commerciale ou inscription volontaire au RC sont présentes
- **Sociétés simples** : pas inscriptibles au RC → absentes

Stratégie de fallback : si Zefix ne renvoie pas de résultat, ZARYA bascule sur un **formulaire de saisie manuelle**.

---

## 3. API Zefix — spécification technique

### 3.1 Environnements

| Environnement | Base URL |
|---|---|
| Intégration (tests) | `https://www.zefixintg.admin.ch/ZefixPublicREST/api/v1` |
| Production | `https://www.zefix.admin.ch/ZefixPublicREST/api/v1` |

Switch via variable d'environnement `ZEFIX_BASE_URL` (cf. § 5).

Documentation officielle Swagger : `https://www.zefix.admin.ch/ZefixPublicREST/swagger-ui/index.html`

### 3.2 Authentification

**HTTP Basic Auth obligatoire sur chaque requête.** Pas de session, pas de clé API, pas de token bearer.

```
Authorization: Basic base64(username:password)
```

Credentials obtenus par demande email à `zefix@bj.admin.ch` (un couple identique pour intégration et production).

**Règles ZARYA** :
- Credentials stockés **uniquement** côté serveur en variables d'environnement : `ZEFIX_USERNAME`, `ZEFIX_PASSWORD`
- Jamais commités, jamais exposés au client navigateur
- Stockés dans Supabase Vault pour l'env de production (cf. [`security-and-audit.md`](./security-and-audit.md))
- En dev local : `.env.local` (gitignoré) + valeurs partagées via 1Password équipe

### 3.3 CORS

⚠️ **L'API Zefix ne supporte pas CORS.** Tout appel direct depuis un navigateur (`fetch` côté client) sera bloqué.

**Conséquence architecturale** : l'intégration Zefix est exclusivement **backend**. Tous les appels passent par une **route handler Next.js** (`/api/zefix/*`) qui :
1. Vérifie l'authentification utilisateur et résout le `cabinet_id`
2. Vérifie le consentement nLPD
3. Logue dans la table d'audit (`crm.zefix_recherche_cabinet` ou `salaire.zefix_recherche`)
4. Applique le throttle interne
5. Vérifie le cache
6. Appelle Zefix avec les credentials serveur
7. Retourne une réponse normalisée au client

Cette dérogation au pattern "Server Actions par défaut" est documentée dans `CLAUDE.md` § "Server actions vs Route handlers" (intégration tierce à retour spécifique + besoin de streaming d'auto-complétion).

### 3.4 Endpoints utilisés

| Méthode | Endpoint | Usage ZARYA |
|---|---|---|
| `GET` | `/company/uid/{uid}` | Détail entreprise par IDE (format `CHE112133855`, sans tirets ni points) |
| `POST` | `/company/search` | Recherche par nom (body JSON) |
| `GET` | `/company/chid/{chid}` | Détail par CHID (numéro cantonal) |
| `GET` | `/company/ehraid/{ehraid}` | Détail par identifiant EHRA |
| `GET` | `/community` | Liste des communes BFS (référentiel) |
| `GET` | `/legalForm` | Liste des formes juridiques (référentiel) |

**Body de `/company/search`** :
```json
{
  "name": "Cabinet Dupont",
  "canton": "GE",
  "activeOnly": true,
  "languageKey": "fr"
}
```

**Format IDE** : Zefix accepte les deux variantes (`CHE-112.133.855` et `CHE112133855`) sur certains endpoints, mais la version **sans séparateurs** est plus fiable et est la forme canonique recommandée pour les appels. ZARYA stocke en format affichable avec séparateurs et **normalise sans séparateurs avant l'appel**.

### 3.5 Format
- REST sur HTTPS
- Réponse JSON UTF-8
- Pas de pagination nécessaire sur les endpoints utilisés (résultats < 100 typiquement)
- Timeout serveur observé : ~30s

### 3.6 Rate limiting

Zefix impose des **quotas par compte**, non publiés contractuellement mais observés en pratique :
- Throttle recommandé : **1 requête / seconde minimum** entre appels (recommandation des wrappers communautaires)
- Quotas journaliers : ordre de grandeur du millier, à mesurer en pilote
- HTTP 429 attendu en cas de dépassement

Stratégie ZARYA :
- **Throttle interne** : token bucket à 1 req/s par compte Zefix (pas par cabinet — c'est le même compte partagé)
- **Cache agressif** (cf. § 5.4) pour limiter les appels à la source
- **Backoff exponentiel** sur 429 (1s, 2s, 4s, 8s, abandon)
- **Alerte ops** si > 80% du quota journalier estimé

### 3.7 Codes d'erreur observés

| Code | Signification | Action ZARYA |
|---|---|---|
| 200 | OK | — |
| 400 | Requête mal formée (IDE invalide, paramètres manquants) | Validation Zod renvoyée au client |
| 401 | Authentification échouée | Alerte ops critique (credentials cassés) |
| 403 | Accès refusé (compte suspendu / quota dépassé contractuellement) | Alerte ops critique |
| 404 | Entreprise non trouvée | Fallback saisie manuelle |
| 429 | Rate limit | Backoff puis retry |
| 5xx | Erreur Zefix | Retry x2 puis fallback saisie manuelle |

---

## 4. Conformité nLPD et consentement

### 4.1 Nature des données
Les données Zefix sont **publiques** (registre du commerce). Mais leur **collecte automatisée et leur stockage** dans un outil tiers (ZARYA) activent la nLPD, en particulier l'obligation d'information et de finalité.

### 4.2 Consentement explicite
ZARYA demande un consentement avant chaque appel Zefix.

**Pour le cabinet** (onboarding fiduciaire) :
> *"J'autorise ZARYA à récupérer les informations publiques de mon cabinet depuis le registre du commerce suisse (Zefix), et à les conserver pour préremplir mon dossier."*

**Pour le client** (onboarding client) :
> *"J'autorise ZARYA à récupérer les informations publiques de mon entreprise depuis le registre du commerce suisse (Zefix), et à les conserver pour préremplir mon dossier."*

- Checkbox **non pré-cochée** par défaut. La saisie manuelle reste accessible sans donner le consentement, pour respecter le principe de proportionnalité de la nLPD.
- Texte du consentement et version persistés dans la ligne de log (champ `texte_consentement` + `version_consentement`)
- Pas d'appel Zefix si non coché → bouton "Saisir manuellement" mis en avant

> **Note** : la version précédente de ce document prévoyait une checkbox cochée par défaut. Décision révisée car le caractère public des données n'exonère pas du devoir d'opt-in explicite quand on stocke côté ZARYA. Le préposé fédéral à la protection des données recommande l'opt-in pour ce type de collecte agrégée.

### 4.3 Conservation
- Réponse Zefix brute conservée **5 ans** (preuve d'audit + traçabilité du consentement)
- Données extraites copiées dans `crm.cabinet` / `crm.client` (utilisation produit, durée du mandat)
- Pas de re-distribution à des tiers
- Suppression sur demande du droit d'accès / oubli, sauf obligation légale de conservation

---

## 5. Architecture d'intégration côté ZARYA

### 5.1 Localisation
Package workspace dédié : `/packages/integrations/zefix/`

```
/packages/integrations/zefix/
├── src/
│   ├── client.ts          # HTTP client + auth
│   ├── types.ts           # Types TS de l'API Zefix
│   ├── schemas.ts         # Schémas Zod (validation des réponses)
│   ├── normalize.ts       # Normalisation IDE, mapping vers types ZARYA
│   ├── throttle.ts        # Token bucket
│   ├── cache.ts           # Wrapper cache
│   ├── errors.ts          # ZefixError, ZefixRateLimitError, ZefixAuthError
│   └── index.ts           # API publique du package
├── package.json
└── tsconfig.json
```

### 5.2 API publique du package

```typescript
// /packages/integrations/zefix/src/index.ts
export interface ZefixCompany {
  ehraid: string;
  uid: string;              // IDE format affichable CHE-XXX.XXX.XXX
  uidRaw: string;           // IDE format brut CHEXXXXXXXXX
  name: string;
  legalSeat: string;
  legalForm: { id: string; name: string };
  status: 'ACTIVE' | 'IN_LIQUIDATION' | 'DELETED';
  registrationDate: string;
  capitalAmount?: number;
  capitalCurrency?: string;
  purpose?: string;
  organs: ZefixOrgan[];
  address: ZefixAddress;
  cantons: string[];
}

export interface ZefixSearchOptions {
  canton?: string;
  activeOnly?: boolean;
  languageKey?: 'fr' | 'de' | 'it' | 'en';
}

export class ZefixClient {
  constructor(opts: {
    baseUrl: string;
    username: string;
    password: string;
    cache: CacheAdapter;
    throttle: ThrottleAdapter;
    logger: Logger;
  });

  searchByUid(uid: string, ctx: AuditContext): Promise<ZefixCompany | null>;
  searchByName(name: string, opts: ZefixSearchOptions, ctx: AuditContext): Promise<ZefixCompany[]>;
  getDetailByEhraid(ehraid: string, ctx: AuditContext): Promise<ZefixCompany>;
}

export interface AuditContext {
  cabinetId: string | null;        // null si cabinet pas encore créé (onboarding fiduciaire étape 0)
  sessionId: string | null;        // session_onboarding_fiduciaire ou _client
  userId: string | null;           // auth.users
  ipAddress: string;
  consent: { given: boolean; text: string; version: string };
}
```

Le `cabinetId` peut être null **uniquement** pour l'onboarding fiduciaire étape A (le cabinet n'existe pas encore dans `crm.cabinet`). Toute autre invocation avec `cabinetId = null` est rejetée.

### 5.3 Flow d'un appel

```
1. User saisit "Cabinet Dupont SA" (ou IDE)
        ↓
2. UI vérifie : consentement coché ? Sinon, désactive le bouton de recherche
        ↓
3. User clique "Rechercher" ou auto-complétion debounced déclenche
        ↓
4. fetch('/api/zefix/search', { method: 'POST', body: JSON.stringify({ query, consent }) })
        ↓
5. Route handler /api/zefix/search :
   a. Auth check (cookie Supabase) + resolveCabinet(req)
   b. Validation Zod du body
   c. Vérifier consent.given === true → sinon 403
   d. Insert ligne d'audit (statut 'initie') dans la table de log appropriée
   e. throttle.acquire() — attend si nécessaire
   f. cache.get(hash(query + opts)) — si hit, retour direct
   g. Sinon : ZefixClient.searchByName(...)
   h. Validation Zod de la réponse Zefix (defense in depth)
   i. cache.set(...) avec TTL
   j. Update ligne d'audit (statut 'succes', nb_resultats, response_brute)
   k. Retour des résultats normalisés au client
        ↓
6. UI affiche la liste
        ↓
7. User sélectionne → /api/zefix/uid/{uid} pour le détail complet
        ↓
8. UI auto-remplit le formulaire (tous les champs éditables)
        ↓
9. User valide → crm.cabinet ou crm.client créé/mis à jour
```

### 5.4 Cache Zefix

Les données Zefix changent rarement (mensuel voire annuel pour la plupart des entreprises). Cache agressif acceptable.

| Type d'appel | TTL | Clé |
|---|---|---|
| Recherche par nom | 1 heure | `zefix:search:${sha256(name + canton + activeOnly)}` |
| Détail par IDE | 24 heures | `zefix:uid:${uidRaw}` |
| Détail par EHRAID | 24 heures | `zefix:ehraid:${ehraid}` |
| Référentiels (communes, formes juridiques) | 30 jours | `zefix:ref:${type}` |

**Stockage** :
- **MVP** : table Postgres `cache.zefix_response` (simplicité ops, pas d'infra additionnelle)
- **Si saturation** : migration vers Upstash Redis (eu-central-1)

Schéma proposé :
```sql
CREATE SCHEMA IF NOT EXISTS cache;

CREATE TABLE cache.zefix_response (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cache_zefix_expires ON cache.zefix_response (expires_at);
```

Pas de RLS sur ce schéma cache : les données sont publiques (registre du commerce). Le filtrage métier se fait en amont (consentement + audit log).

Job de purge horaire : `DELETE FROM cache.zefix_response WHERE expires_at < now()`.

Invalidation manuelle possible (bouton "Rafraîchir depuis Zefix" disponible pour les rôles `responsable`).

Bénéfices :
- Réduction drastique des appels Zefix (cache hit attendu > 70 % en croisière)
- Latence améliorée (cache hit ~10ms vs ~500ms appel réel)
- Résilience si Zefix indisponible (on sert les données cachées avec un badge "Données du JJ/MM")

### 5.5 Gestion d'erreurs

| Cas | Comportement |
|---|---|
| Zefix down (5xx) | Retry x2 backoff exponentiel, puis fallback saisie manuelle + notification ops |
| Rate limit (429) | Backoff transparent pour l'utilisateur, max 8s puis erreur user-friendly |
| Auth échouée (401/403) | Erreur 500 côté ZARYA + **alerte ops critique** (credentials cassés) |
| Pas de résultat (404 ou liste vide) | Message + bouton "Saisir manuellement" |
| Timeout (>10s côté ZARYA) | Annulation + fallback saisie manuelle + log incident |
| Réponse malformée (schéma Zod fail) | Log + alerte ops, fallback saisie manuelle |
| Consent non donné | Pas d'appel, formulaire libre directement |

Classes d'erreur typées (cf. `CLAUDE.md` § Errors) :
```typescript
class ZefixError extends Error {}
class ZefixAuthError extends ZefixError {}        // 401, 403
class ZefixRateLimitError extends ZefixError {}   // 429
class ZefixNotFoundError extends ZefixError {}    // 404
class ZefixTimeoutError extends ZefixError {}
class ZefixSchemaError extends ZefixError {}      // Réponse imprévue
```

### 5.6 Variables d'environnement

```bash
# /apps/web/.env.local (dev)
ZEFIX_BASE_URL=https://www.zefixintg.admin.ch/ZefixPublicREST/api/v1
ZEFIX_USERNAME=xxx
ZEFIX_PASSWORD=xxx

# Production (Supabase Vault)
ZEFIX_BASE_URL=https://www.zefix.admin.ch/ZefixPublicREST/api/v1
ZEFIX_USERNAME=<vault>
ZEFIX_PASSWORD=<vault>
```

`.env.example` documenté avec valeurs vides + commentaire.

---

## 6. Schéma de log

Tables existantes documentées dans les schémas onboarding :
- `crm.zefix_recherche_cabinet` (onboarding fiduciaire — voir [`onboarding-fiduciaire-schema.md`](../data-model/onboarding-fiduciaire-schema.md))
- `salaire.zefix_recherche` (onboarding client — voir [`onboarding-client-schema.md`](../data-model/onboarding-client-schema.md))

Champs communs :
- Requête utilisateur (texte brut tel que tapé)
- Endpoint appelé + paramètres normalisés
- Réponse brute Zefix (`jsonb`)
- Nb résultats
- IDE finalement sélectionné par l'utilisateur (le cas échéant)
- Consentement : `consentement_donne boolean`, `texte_consentement text`, `version_consentement text`, `date_consentement timestamptz`
- IP d'origine (`inet`)
- `cabinet_id`, `user_id`, `session_id`
- Statut : `initie | succes | echec | rate_limited | timeout`
- Durée totale (ms), cache hit (boolean)

Rétention 5 ans pour audit nLPD.

---

## 7. Recherche par nom — UX

### 7.1 Auto-complétion
À mesure que l'utilisateur tape (debounce 500ms — porté de 300 à 500 pour respecter le throttle 1 req/s même en cas de frappe rapide) :
- À partir de **4 caractères** (pas 3 : trop de bruit et risque de saturer le throttle), appel à `POST /api/zefix/search`
- Affichage en dropdown des 10 premiers résultats avec :
  - Raison sociale (en gras)
  - Forme juridique
  - Siège (ville, canton)
  - IDE
  - Statut (si non actif → indication "⚠️ En liquidation" ou "❌ Radié")

Note : si le throttle global déclenche une attente > 200ms, l'UI affiche un spinner discret. Pas de message d'erreur.

### 7.2 Sélection
Clic sur un résultat → appel à `GET /api/zefix/uid/{uid}` pour récupérer le détail complet (organes, capital, but) → auto-remplissage.

### 7.3 Multi-résultats homonymes
Cas typique : plusieurs entreprises avec le même nom de base (chaînes, franchises).

UI : affichage clair avec distinction par canton et IDE. Si > 10 matches, indication "Plus de 10 résultats, affinez votre recherche".

### 7.4 Pas de résultat
Message contextuel selon le type de recherche :
- Si recherche par IDE : "Aucune entreprise trouvée avec cet IDE. Vérifiez le format CHE-XXX.XXX.XXX."
- Si recherche par nom : "Aucune entreprise trouvée. Vous pouvez saisir les informations manuellement."

Bouton "Saisir manuellement" toujours présent.

### 7.5 Validation IDE côté client
Format accepté à la saisie (les deux formes équivalentes) :
- `CHE-123.456.789` (forme affichable)
- `CHE123456789` (forme compacte)

Regex Zod : `/^CHE-?\d{3}\.?\d{3}\.?\d{3}$/`

Normalisation systématique côté serveur en `CHE123456789` avant appel Zefix, puis re-formatage en `CHE-123.456.789` pour stockage / affichage.

---

## 8. Intégration avec le wizard d'onboarding

### 8.1 Étape A onboarding fiduciaire
Premier champ après vérification email : recherche Zefix.
Voir [`/docs/modules/onboarding-fiduciaire.md` § 5](../modules/onboarding-fiduciaire.md) pour la spec UX complète.

Cas particulier : `cabinet_id` est null au moment de l'appel (le cabinet n'existe pas encore en DB). Le log est inséré avec `cabinet_id NULL`, puis backfillé une fois `crm.cabinet` créée à la fin de l'étape A (trigger ou requête de mise à jour applicative).

### 8.2 Étape équivalente onboarding client
Première étape du wizard d'onboarding client.
Voir [`/docs/modules/onboarding-client.md`](../modules/onboarding-client.md).

`cabinet_id` est toujours présent (le cabinet existe, c'est lui qui ajoute un nouveau client).

### 8.3 Réutilisation en cours d'usage
La recherche Zefix peut être réinvoquée :
- Lors de l'**ajout d'un nouveau client** par le cabinet (en dehors d'un onboarding initial)
- Lors de la **mise à jour de la fiche** si l'IDE change
- Lors d'une **vérification de cohérence** (Phase 2 : détection des entreprises radiées dans le portefeuille)

---

## 9. Tests

### 9.1 Tests unitaires (`packages/integrations/zefix`)
- Parsing des réponses Zefix (mocks JSON, fixtures dans `__fixtures__/`)
- Gestion des cas limites (champs manquants, formats inhabituels, organes vides)
- Validation Zod des réponses (golden tests)
- Validation du format IDE (toutes variantes acceptées et normalisées)
- Comportement du throttle (token bucket)
- Cache hit/miss

### 9.2 Tests d'intégration (env Zefix INTG)
- Appel réel à `zefixintg.admin.ch` avec credentials de test
- IDE de référence (sociétés réelles stables, ex. `CHE-105.860.760` Coop)
- Vérification du cache (2e appel = hit)
- Comportement en cas de timeout simulé (mock réseau)
- Rate limit simulé (429)

### 9.3 Tests E2E (Playwright)
- Wizard d'onboarding fiduciaire complet avec recherche Zefix (env INTG)
- Wizard d'onboarding client idem
- Cas fallback saisie manuelle (consentement décoché)
- Cas Zefix down (mock 5xx)

### 9.4 Tests d'isolation multi-tenant
Bien que les données Zefix soient publiques, **les logs d'appels (`zefix_recherche_*`) sont scopés par cabinet** et doivent respecter le pattern multi-tenant :
- Cabinet A ne peut pas lire les recherches du cabinet B
- Tests obligatoires en CI (cf. `CLAUDE.md` § 1 et `multi-tenant.md` § 5)

---

## 10. Monitoring

### 10.1 Métriques (Pino + OpenTelemetry)
- Volume d'appels Zefix par jour / par cabinet
- Latence p50 / p95 / p99 (avec et sans cache)
- Taux d'erreur par code (401, 429, 5xx)
- Taux de cache hit
- Taux d'utilisation Zefix vs saisie manuelle (signal d'adoption / friction nLPD)
- Distribution des codes de retour

### 10.2 Alertes
- **Critique** : 401/403 répétés → credentials cassés ou compte suspendu
- **Critique** : taux d'erreur > 10% sur 15 min
- **Warning** : quota journalier estimé > 80%
- **Warning** : latence p95 > 3s
- **Info** : Zefix down détecté → bannière "Service Zefix indisponible, saisie manuelle disponible"

---

## 11. Évolution future

### Phase 2
- **Vérification proactive** : job mensuel qui re-check les statuts Zefix des clients du portefeuille pour détecter les radiations / liquidations
- **Endpoint SOGC** : si l'accès est ouvert avec nos credentials, polling des publications par IDE pour notifications proactives de changements (administrateur, siège, but) — voir § 11.3
- **Cross-référence ESTV** pour récupérer le numéro TVA actif (API ESTV existe)
- **Enrichissement** via d'autres sources publiques (Moneyhouse pour les données financières si pertinent)

### Phase 3
- **Connecteur Zefix RM** (registre des marques) si pertinent pour des cabinets spécialisés
- **Synchronisation continue** : alertes automatiques sur les changements significatifs (changement d'administrateur, modification du siège)

### 11.3 Note sur SOGC
La même API expose les publications SOGC (Feuille officielle suisse du commerce) via des endpoints `/publication/*`. Si nos credentials y donnent accès, c'est la voie privilégiée pour la **détection proactive de mutations** mentionnée en § 8.3, sans avoir à requêter chaque IDE individuellement. À vérifier en pilote avant de poser ça en roadmap ferme.

---

## 12. Hors-scope MVP

- Recherche TVA via API ESTV
- Vérification proactive des statuts (job mensuel)
- Enrichissement Moneyhouse / autres
- Notifications de changements Zefix automatiques
- Multi-pays (équivalents Zefix dans d'autres juridictions)
- Endpoint SOGC (à valider en pilote)

---

## 13. Questions ouvertes

- [ ] **Quotas exacts** par compte Zefix : à mesurer en pilote, demander upgrade si besoin (contact `zefix@bj.admin.ch`)
- [ ] **Accès SOGC** : nos credentials permettent-ils `/publication/*` ? À tester
- [ ] **Politique en cas de désactivation Zefix** (improbable mais possible) : self-hosted fallback ?
- [ ] **Données dérivées** : si Zefix change le canton d'un client, on alerte le cabinet automatiquement ?
- [ ] **Cabinet ZARYA lui-même** : son propre IDE doit-il être visible dans certaines réponses (factures émises) ?
- [ ] **Bascule cache Postgres → Redis** : seuil de bascule (req/min ? taille table ?)

---

## 14. Référence ADR

Décision structurante actée : [`ADR 0009 — Intégration Zefix via route handler serveur avec HTTP Basic Auth`](./decisions/0009-zefix-integration.md).
