---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: [data-residency]
referenced_by: [onboarding-fiduciaire, onboarding-client, crm]
---

# Intégration Zefix

## 1. Contexte

**Zefix** (Zentraler Firmenindex) est l'**index central des entreprises suisses**, géré par l'Office fédéral du registre du commerce. Il agrège les données du registre du commerce de tous les cantons et expose une **API publique gratuite**.

ZARYA utilise Zefix pour :
1. **Onboarding fiduciaire** : auto-remplir l'identité du cabinet à l'inscription
2. **Onboarding client** : auto-remplir l'identité du client final lors de l'ajout d'un nouveau client

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

## 3. API Zefix

### 3.1 Endpoints clés
Documentation officielle : https://www.zefix.admin.ch/ZefixPublicREST/

| Endpoint | Usage |
|---|---|
| `GET /api/v1/company/uid/{uid}` | Recherche par IDE (CHE-XXX.XXX.XXX) |
| `GET /api/v1/company/search` | Recherche par nom (paramètres `name`, `canton`) |
| `GET /api/v1/company/{ehraid}` | Détail complet d'une entreprise par ID EHRA |

### 3.2 Format
- REST sur HTTPS
- Réponse JSON
- Pas de pagination nécessaire (résultats < 100 typiquement)
- Encodage UTF-8

### 3.3 Authentification
ZARYA dispose d'une **clé API Zefix** (cf. mention dans la conversation produit). Authentification probablement via header `X-API-Key` ou Bearer token.

⚠️ Le détail exact d'authentification est à confirmer dans la doc Zefix une fois la clé en main.

### 3.4 Rate limiting
Zefix impose des **quotas par clé API**. Limites typiques d'APIs publiques gouvernementales suisses :
- Quelques requêtes par seconde
- Quelques milliers par jour

À monitorer dès la mise en production. Stratégie côté ZARYA :
- Cache des résultats (voir § 6)
- Rate limit interne avant l'appel
- Backoff exponentiel en cas de 429

## 4. Conformité nLPD et consentement

### 4.1 Nature des données
Les données Zefix sont **publiques** (registre du commerce). Mais leur **agrégation** dans un outil tiers (ZARYA) active la nLPD.

### 4.2 Consentement explicite
ZARYA demande un consentement **explicite** à chaque appel Zefix :

**Pour le cabinet** (onboarding fiduciaire) :
> *"J'autorise ZARYA à récupérer les informations publiques de mon cabinet depuis le registre du commerce suisse (Zefix)."*

**Pour le client** (onboarding client) :
> *"Vous autorisez ZARYA à récupérer les informations publiques de votre entreprise depuis le registre du commerce suisse (Zefix)."*

- Checkbox **coché par défaut** (donnée publique, friction minimale acceptable)
- Possibilité de **décocher** → fallback saisie manuelle
- Texte du consentement et version visible
- Log dans `crm.zefix_recherche_cabinet` ou `salaire.zefix_recherche` selon contexte

### 4.3 Conservation
- Réponse Zefix brute conservée 5 ans (preuve d'audit)
- Données extraites copiées dans `crm.cabinet` ou `crm.client` (utilisation produit)
- Pas de re-distribution à des tiers

## 5. Architecture d'intégration côté ZARYA

### 5.1 Wrapper interne
Comme pour Bedrock, encapsulation propre dans `/lib/integrations/zefix/` :

```typescript
// /lib/integrations/zefix/types.ts
export interface ZefixCompany {
  ehraid: string;
  uid: string;          // IDE format CHE-XXX.XXX.XXX
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
  name: string;
  // ...
}

// /lib/integrations/zefix/client.ts
export class ZefixClient {
  async searchByUid(uid: string, cabinet_id: string): Promise<ZefixCompany | null>;
  async searchByName(name: string, canton?: string, cabinet_id: string): Promise<ZefixCompany[]>;
  async getDetailById(ehraid: string, cabinet_id: string): Promise<ZefixCompany>;
}
```

Le `cabinet_id` est **toujours requis** pour permettre l'audit et le rate limiting par tenant.

### 5.2 Flow d'un appel
```
1. User saisit "Cabinet Dupont SA" (ou IDE)
        ↓
2. UI affiche checkbox consentement (coché)
        ↓
3. User clique "Rechercher"
        ↓
4. POST /api/zefix/search { query, consent: true, cabinet_id }
        ↓
5. Côté serveur :
   - Vérifier consent = true
   - Logger l'appel dans crm.zefix_recherche_*
   - Vérifier le cache (clé : hash(query))
   - Si cache miss : appeler Zefix API
   - Stocker la réponse en cache (TTL 24h)
   - Retourner les résultats
        ↓
6. UI affiche la liste de résultats
        ↓
7. User sélectionne le bon
        ↓
8. UI auto-remplit le formulaire
        ↓
9. User peut éditer puis valide
        ↓
10. crm.cabinet ou crm.client créé/mis à jour
```

### 5.3 Cache Zefix
Les données Zefix changent rarement (mensualisé voire annuel pour la plupart des entreprises). Cache agressif acceptable :

- **TTL 24h** pour les recherches par nom
- **TTL 7 jours** pour les détails par UID (info plus stable)
- Stockage : Redis ou table Postgres dédiée `cache.zefix_response`
- Invalidation manuelle possible (bouton "Rafraîchir depuis Zefix" pour les admins)

Bénéfice :
- Réduction des appels Zefix (évite de saturer le quota)
- Latence améliorée (cache hit ~5ms vs ~500ms appel réel)
- Résilience si Zefix indisponible (on sert les données cachées)

### 5.4 Gestion d'erreurs

| Cas | Comportement |
|---|---|
| Zefix down (5xx) | Retry x2 avec backoff, puis fallback saisie manuelle + notification |
| Rate limit (429) | Queue interne avec attente, transparent pour l'utilisateur |
| Pas de résultat | Message + bouton "Saisir manuellement" |
| Timeout (>10s) | Fallback saisie manuelle + log incident |
| Réponse malformée | Log + alerte ops, fallback saisie manuelle |
| Consent refusé | Pas d'appel, formulaire libre directement |

## 6. Schéma de log

Tables existantes documentées dans les schémas onboarding :
- `crm.zefix_recherche_cabinet` (onboarding fiduciaire — voir [`onboarding-fiduciaire-schema.md`](../data-model/onboarding-fiduciaire-schema.md))
- `salaire.zefix_recherche` (onboarding client — voir [`onboarding-client-schema.md`](../data-model/onboarding-client-schema.md))

Ces tables stockent :
- Requête utilisateur
- Réponse brute Zefix (jsonb)
- Consentement donné (boolean + timestamp)
- IP d'origine
- Cabinet et user à l'origine

Rétention 5 ans pour audit nLPD.

## 7. Recherche par nom — UX

### 7.1 Auto-complétion
À mesure que l'utilisateur tape (debounce 300ms) :
- À partir de 3 caractères, appel à `/api/v1/company/search?name={query}`
- Affichage en dropdown des 10 premiers résultats avec :
  - Raison sociale (en gras)
  - Forme juridique
  - Siège (ville, canton)
  - IDE
  - Statut (si non actif → indication "⚠️ En liquidation" ou "❌ Radié")

### 7.2 Sélection
Clic sur un résultat → appel à `/api/v1/company/uid/{uid}` pour récupérer le détail complet → auto-remplissage.

### 7.3 Multi-résultats homonymes
Cas typique : plusieurs entreprises avec le même nom de base (chaînes, franchises).

UI : affichage clair avec distinction par canton et IDE.

### 7.4 Pas de résultat
Message contextuel selon le type de recherche :
- Si recherche par IDE : "Aucune entreprise trouvée avec cet IDE. Vérifiez le format CHE-XXX.XXX.XXX."
- Si recherche par nom : "Aucune entreprise trouvée. Vous pouvez saisir les informations manuellement."

Bouton "Saisir manuellement" toujours présent.

## 8. Intégration avec le wizard d'onboarding

### 8.1 Étape 1 onboarding fiduciaire
Premier champ après vérification email : recherche Zefix.
Voir [`/docs/modules/onboarding-fiduciaire.md` § 5](../modules/onboarding-fiduciaire.md) pour la spec UX complète.

### 8.2 Étape équivalente onboarding client
Première étape du wizard d'onboarding client.
Voir [`/docs/modules/onboarding-client.md`](../modules/onboarding-client.md).

### 8.3 Réutilisation en cours d'usage
La recherche Zefix peut être réinvoquée :
- Lors de l'**ajout d'un nouveau client** par le cabinet (en dehors d'un onboarding initial)
- Lors de la **mise à jour de la fiche** si l'IDE change
- Lors d'une **vérification de cohérence** (Phase 2 : détection des entreprises radiées dans le portefeuille)

## 9. Tests

### 9.1 Tests unitaires
- Parsing des réponses Zefix (mocks JSON)
- Gestion des cas limites (champs manquants, formats inhabituels)
- Validation du format IDE côté client

### 9.2 Tests d'intégration
- Appel réel à Zefix avec des IDE de test (sociétés connues stables)
- Vérification du cache
- Comportement en cas de timeout simulé

### 9.3 Tests E2E
- Wizard d'onboarding fiduciaire complet avec recherche Zefix réelle
- Idem onboarding client
- Cas fallback saisie manuelle

## 10. Monitoring

### 10.1 Métriques
- Volume d'appels Zefix par jour / par cabinet
- Latence p50 / p95 / p99
- Taux d'erreur
- Taux de cache hit
- Taux d'utilisation Zefix vs saisie manuelle (signal d'adoption / friction)

### 10.2 Alertes
- Quota Zefix > 80% du quotidien → alerte ops
- Latence p95 > 3s → investigation
- Taux d'erreur > 5% → escalade
- Zefix down → notification équipe + bannière info utilisateurs

## 11. Évolution future

### Phase 2
- **Vérification proactive** : job mensuel qui re-check les statuts Zefix des clients du portefeuille pour détecter les radiations / liquidations
- **Cross-référence ESTV** pour récupérer le numéro TVA actif (API ESTV existe)
- **Enrichissement** via d'autres sources publiques (Moneyhouse pour les données financières si pertinent)

### Phase 3
- **Connecteur Zefix RM** (registre des marques) si pertinent pour des cabinets spécialisés
- **Synchronisation continue** : alertes automatiques sur les changements significatifs (changement d'administrateur, modification du siège)

## 12. Hors-scope MVP

- Recherche TVA via API ESTV
- Vérification proactive des statuts (job mensuel)
- Enrichissement Moneyhouse / autres
- Notifications de changements Zefix automatiques
- Multi-pays (équivalents Zefix dans d'autres juridictions)

## 13. Questions ouvertes

- [ ] **Détail de l'authentification API Zefix** : à confirmer une fois la clé en main (header, query param ?)
- [ ] **Quotas exacts** par clé : à mesurer en pilote, demander upgrade si besoin
- [ ] **Format de stockage du cache** : Redis (latence min) vs Postgres (simplicité ops) ?
- [ ] **Politique en cas de désactivation Zefix** (improbable mais possible) : self-hosted fallback ?
- [ ] **Données dérivées** : si Zefix change le canton d'un client, on alerte le cabinet automatiquement ?
- [ ] **Cabinet ZARYA lui-même** : son propre IDE doit-il être visible dans certaines réponses (factures émises) ?
