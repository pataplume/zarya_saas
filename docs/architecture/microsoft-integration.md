---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
domain: architecture
depends_on: [data-residency, multi-tenant]
referenced_by: [doc, calendar, onboarding-fiduciaire]
---

# Intégration Microsoft 365

## 1. Contexte

ZARYA s'intègre profondément avec **Microsoft 365** (Outlook, OneDrive, Calendar, SharePoint) parce que c'est la stack collaborative dominante des cabinets fiduciaires suisses.

Cette intégration alimente :
- **Module Doc** : réception et classement des documents entrants via email Outlook
- **Module Calendar** : synchronisation des échéances et relances
- **Module Salaire** : envoi des notifications de validation aux clients
- **Recherche** : indexation optionnelle de OneDrive / SharePoint

**Multi-tenant** : chaque cabinet configure son propre tenant Microsoft 365. Les tokens OAuth sont stockés par `cabinet_id` dans `crm.cabinet_integration`. Voir [`/docs/architecture/multi-tenant.md`](./multi-tenant.md).

## 2. Microsoft Graph API

L'intégration passe exclusivement par **Microsoft Graph API** (v1.0 stable). Pas d'EWS, pas d'Exchange Web Services legacy.

### 2.1 Endpoints clés

| Endpoint | Usage ZARYA |
|---|---|
| `GET /me/messages` | Lire les emails reçus |
| `GET /me/messages/{id}/attachments` | Récupérer les pièces jointes |
| `POST /me/sendMail` | Envoyer un email (relances, notifications) |
| `GET /me/events` | Lire le calendrier |
| `POST /me/events` | Créer un événement (échéances) |
| `GET /me/drive/root/children` | Naviguer OneDrive |
| `GET /me/drive/items/{id}/content` | Télécharger un fichier OneDrive |
| `GET /sites/{site-id}/drives` | Lister les drives SharePoint |
| `GET /subscriptions` | Webhooks pour notifications temps réel |

### 2.2 Authentification : OAuth 2.0
Flow Authorization Code avec refresh token.

**Type d'application** : "Multi-tenant" enregistrée sur Azure AD ZARYA. Chaque cabinet client consent indépendamment.

**Endpoints OAuth** :
- Authorization : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- Token : `https://login.microsoftonline.com/common/oauth2/v2.0/token`

**Redirect URI** : `https://app.zarya.ch/api/integrations/microsoft/callback`

### 2.3 Scopes demandés

| Scope | Justification | Critique |
|---|---|---|
| `offline_access` | Refresh token pour usage long terme | ✓ |
| `User.Read` | Lire le profil utilisateur (email, nom) | ✓ |
| `Mail.Read` | Lire les emails reçus | ✓ |
| `Mail.Send` | Envoyer emails de relance | ✓ |
| `Calendars.ReadWrite` | Gérer les échéances dans Outlook | ✓ |
| `Files.Read` | Lire OneDrive/SharePoint | Optionnel |
| `Sites.Read.All` | Lire SharePoint (Phase 2) | Phase 2 |

**Principe du moindre privilège** : on ne demande PAS `Mail.ReadWrite` (lecture suffit, on ne modifie pas les emails du cabinet).

### 2.4 Consentement administrateur
Certains scopes (notamment `Sites.Read.All`) nécessitent un **admin consent**. Le wizard de connexion gère ce cas :

1. Tentative de connexion utilisateur standard
2. Si scope refusé → message : "Votre administrateur Microsoft 365 doit autoriser ZARYA"
3. Bouton "Demander à l'administrateur" → email automatique avec lien admin consent

## 3. Architecture d'intégration

### 3.1 Wrapper interne

```typescript
// /lib/integrations/microsoft/client.ts
export class MicrosoftGraphClient {
  constructor(private cabinet_id: string) {}
  
  async listEmails(filter?: EmailFilter): Promise<Email[]>;
  async getEmail(id: string): Promise<EmailDetail>;
  async downloadAttachment(emailId: string, attachmentId: string): Promise<Buffer>;
  async sendEmail(params: SendEmailParams): Promise<void>;
  async listEvents(filter?: EventFilter): Promise<Event[]>;
  async createEvent(params: CreateEventParams): Promise<Event>;
  async listOneDriveFiles(folder?: string): Promise<File[]>;
  async downloadOneDriveFile(itemId: string): Promise<Buffer>;
}
```

Toujours instancié avec un `cabinet_id`. Récupère automatiquement les credentials depuis `crm.cabinet_integration` et gère le refresh token de manière transparente.

### 3.2 Gestion des tokens
```sql
-- Dans crm.cabinet_integration
{
  type: 'microsoft_365',
  credentials: {
    access_token: '...',      -- Chiffré
    refresh_token: '...',     -- Chiffré
    token_type: 'Bearer',
    expires_at: '2026-05-26T15:30:00Z',
    scope: 'offline_access User.Read Mail.Read ...'
  },
  parametres: {
    tenant_id: 'abc-def-...',
    user_principal_name: 'cabinet@example.ch',
    tenant_region: 'Europe',  -- Pour vérification résidence
  }
}
```

**Chiffrement** : champs `access_token` et `refresh_token` chiffrés via Supabase Vault.

**Refresh proactif** : 5 minutes avant expiration, refresh automatique en arrière-plan. Évite les 401 en milieu de requête utilisateur.

### 3.3 Détection de la région du tenant
**Critique pour la conformité** : il faut vérifier que le tenant Microsoft est bien en région UE.

Au moment du callback OAuth :
1. Appel à `GET /me` pour récupérer le profil
2. Appel à `GET /organization` pour récupérer le détail du tenant
3. Extraction du champ `countryLetterCode` ou `preferredDataLocation`
4. Si hors UE → **avertissement** affiché au cabinet :
   > *"Votre tenant Microsoft 365 semble être hébergé hors UE. Les emails passant par ZARYA resteront en EU (Frankfurt), mais le contenu accessible côté Microsoft 365 reste régi par la politique de votre tenant. Confirmez-vous vouloir continuer ?"*

L'utilisateur peut choisir de continuer (sous sa responsabilité) ou changer de tenant.

⚠️ Confiance ~70% sur l'API exact pour récupérer la région. À valider à l'implémentation.

## 4. Webhooks (notifications temps réel)

Pour le **module Doc**, le polling des emails toutes les minutes est inefficace. Utilisation des **subscriptions Microsoft Graph** pour recevoir les notifications de nouveaux emails en temps réel.

### 4.1 Setup
- À la connexion Microsoft d'un cabinet, ZARYA crée un subscription Graph :
  ```http
  POST /subscriptions
  {
    "changeType": "created",
    "notificationUrl": "https://app.zarya.ch/api/integrations/microsoft/webhook",
    "resource": "/me/mailFolders('Inbox')/messages",
    "expirationDateTime": "+72h",
    "clientState": "{cabinet_id}"
  }
  ```

### 4.2 Renouvellement
Les subscriptions expirent après 72h max. Job nightly qui renouvelle toutes les subscriptions actives.

### 4.3 Réception
Au callback webhook :
- Vérification de la signature (validation token)
- Décodage du `clientState` pour identifier le `cabinet_id`
- Récupération du message via Graph API
- Pipeline du module Doc

### 4.4 Sécurité
- Validation du `validationToken` à la création
- Vérification du `clientState` à chaque notification
- HTTPS only avec certificat valide

## 5. Configuration au sein du wizard onboarding fiduciaire

### 5.1 Étape E du wizard
Section "Microsoft 365" :

```
┌─────────────────────────────────────────┐
│ 📧 Connecter Microsoft 365              │
│                                         │
│ ZARYA va se connecter à votre Outlook   │
│ pour lire les emails reçus et envoyer   │
│ les relances en votre nom.              │
│                                         │
│ Permissions demandées :                 │
│ ✓ Lire vos emails                       │
│ ✓ Envoyer des emails                    │
│ ✓ Gérer votre calendrier                │
│                                         │
│ [Connecter Microsoft 365 →]             │
└─────────────────────────────────────────┘
```

### 5.2 Flow OAuth
1. Clic sur "Connecter"
2. Popup Microsoft (login.microsoftonline.com)
3. User se logge dans son Microsoft 365
4. Consent screen avec les scopes
5. Au consent : callback ZARYA avec code
6. ZARYA échange le code contre access + refresh tokens
7. Vérification de la région du tenant
8. Stockage chiffré dans `crm.cabinet_integration`
9. Création de la subscription webhook
10. Affichage de succès + adresse email connectée

### 5.3 Comportement post-connexion
- Statut affiché dans l'UI : "✓ Connecté à cabinet@example.ch"
- Bouton "Déconnecter" disponible
- Bouton "Reconnecter" si erreur d'auth (token révoqué côté Microsoft)

## 6. Pipeline d'ingestion email (module Doc)

### 6.1 Réception
1. Webhook Microsoft → endpoint ZARYA
2. Lookup du `cabinet_id` via `clientState`
3. Fetch du message complet via Graph API (avec auth du cabinet)
4. Persistance dans `doc.email_brut` (table d'ingestion)
5. Trigger du pipeline de classification

### 6.2 Classification
Voir [`/docs/modules/doc.md`](../modules/doc.md) pour le détail.

En résumé :
- Extraction du texte de l'email
- Téléchargement des pièces jointes
- Pipeline Extraction IA pour classification (type, client, période)
- Création des `doc.proposition_classement`
- Notification au gestionnaire fiduciaire

### 6.3 Filtres
Pas tous les emails ne sont à traiter. Configuration par cabinet :
- Filtrer par dossier (par défaut : Inbox)
- Exclure les expéditeurs internes au cabinet
- Exclure les newsletters et notifications automatiques
- Filtrer par taille (pas les > 50 MB)

## 7. Pipeline d'envoi (relances, notifications)

### 7.1 Côté ZARYA
1. Génération du contenu (template + variables interpolées)
2. Validation par humain (gestionnaire fiduciaire) si configuré
3. Appel `POST /me/sendMail` avec l'auth du cabinet
4. Stockage du résultat dans `crm.relance` ou `salaire.notification`

### 7.2 Identité de l'expéditeur
**Critique** : l'email est envoyé depuis l'adresse du cabinet (cabinet@example.ch), pas une adresse ZARYA.

Avantages :
- Le client final voit son interlocuteur habituel (le cabinet)
- Réponses du client arrivent dans la boîte du cabinet (chaîne email naturelle)
- Pas de risque "expéditeur inconnu" dans les spams

### 7.3 Signature
La signature email du cabinet (configurée à l'onboarding fiduciaire) est automatiquement appliquée.

### 7.4 Tracking
- Lecture détectée via Microsoft Graph si le destinataire a accepté les receipts
- Sinon, on log uniquement l'envoi (statut `envoye`)
- Pas de pixel tracking (intrusif et bloqué par les clients email modernes)

## 8. Sécurité

### 8.1 Stockage des tokens
- Chiffrement at rest via Supabase Vault
- Rotation périodique des access tokens (automatique via refresh)
- Pas de tokens en logs

### 8.2 Permissions runtime
À chaque appel Graph, vérification :
- Token non expiré (refresh proactif sinon)
- `cabinet_id` cohérent avec la session utilisateur courante
- Scope suffisant pour l'opération

### 8.3 Audit
Chaque appel Graph est loggué :
- `cabinet_id`
- Type d'opération (read_emails, send_email, etc.)
- Volume (nb d'éléments lus, nb d'emails envoyés)
- Timestamp
- Statut

Conservation 6 ans (conformité fiduciaire).

### 8.4 Révocation
Si un cabinet déconnecte Microsoft 365 :
- Suppression des tokens stockés
- Suppression de la subscription webhook côté Graph
- Notification "déconnexion effectuée"
- Les actions automatiques en attente sont mises en pause

## 9. Résilience

### 9.1 Microsoft Graph indisponible
- Retry avec backoff exponentiel (3 tentatives)
- Si toujours en échec : queue interne + notification
- Webhook manqué → polling de rattrapage (job horaire)

### 9.2 Token révoqué
- Détection au 401 Unauthorized
- Notification du cabinet : "Reconnexion Microsoft requise"
- Bouton de reconnexion proéminent dans le dashboard
- Workflows en pause tant que la reconnexion n'est pas faite

### 9.3 Rate limiting Graph
Microsoft impose des **throttling limits** (varient selon le tenant et l'usage).

Stratégie :
- Respect des headers `Retry-After`
- Limite interne par cabinet (max N appels / minute)
- Batch des opérations quand possible (`$batch` endpoint Graph)
- Priorisation : envois urgents avant batch d'ingestion

### 9.4 Limites de subscription
Maximum de subscriptions par tenant côté Microsoft. Si dépassement → message clair + suggestion de simplifier la configuration.

## 10. Monitoring

### 10.1 Métriques
- Volume d'emails ingérés / envoyés par cabinet
- Latence Graph p50 / p95 / p99
- Taux d'erreur par endpoint
- Tokens expirés non rafraîchis (signal de souci)
- Subscriptions actives vs expirées

### 10.2 Alertes
- Cabinet sans activité email > 7 jours alors que connexion active → possible bug
- Taux d'erreur Graph > 5% sur un cabinet → investigation
- Subscription expirée non renouvelée → escalade
- Quota throttling atteint → notification cabinet pour ajuster

## 11. Cas particuliers

### 11.1 Boîtes partagées
Un cabinet peut avoir une boîte commune `factures@cabinet.ch` partagée entre membres. À supporter dès le MVP :
- Détection automatique des boîtes partagées dans le tenant
- Choix par le cabinet : connecter une ou plusieurs boîtes
- Permissions Graph spécifiques (`Mail.Read.Shared`)

### 11.2 Emails internes au cabinet
Filtrage : ne pas re-traiter les emails entre membres du cabinet ZARYA (sinon boucle infinie : ZARYA envoie une relance, ZARYA reçoit la copie, ZARYA tente de la classer...).

Détection : header `From` contient un domaine cabinet ou un email connu de `crm.cabinet_membre`.

### 11.3 Emails forwardés
Un email reçu par un autre canal, puis forwardé par un membre cabinet à ZARYA. À traiter comme un email entrant standard, mais avec attention au `From` réel vs forwardeur.

### 11.4 Calendar 2-way sync
Pour les échéances : ZARYA crée des événements dans Outlook (read-only par défaut, modifiable par l'utilisateur).

Si l'utilisateur modifie côté Outlook (déplace, annule) → webhook Calendar reçu → mise à jour de `crm.echeance`.

## 12. Évolution future

### Phase 2
- **SharePoint** : indexation des documents stockés sur SharePoint d'un cabinet
- **Teams** : notifications de ZARYA dans un canal Teams
- **Outlook add-in** : extension dans Outlook pour interagir avec ZARYA directement depuis l'email
- **Boîte partagée multiple** : connexion de N boîtes par cabinet

### Phase 3
- **Microsoft Copilot intégration** : exposition de ZARYA dans Copilot
- **Power Automate** : connecteur officiel ZARYA pour les workflows
- **Multi-account** : un membre peut avoir 2 boîtes Microsoft (perso + cabinet)

## 13. Hors-scope MVP

- Support Exchange On-Premises (cabinet self-hosted) — Microsoft 365 cloud uniquement
- SharePoint indexing (Phase 2)
- Teams notifications (Phase 2)
- Multi-tenant Microsoft pour un même cabinet (rare)
- Migration de configuration depuis un autre outil (ex. SaaS concurrent)

## 14. Questions ouvertes

- [ ] **Région exacte de tenant** : confirmer l'API pour la récupérer (`countryLetterCode` vs `preferredDataLocation` vs `OdataContext`)
- [ ] **Comportement si tenant US** : bloquer complètement ou avertir et laisser passer ?
- [ ] **Subscriptions** : un cabinet avec 5 boîtes partagées = 5 subscriptions à renouveler. Scalabilité ?
- [ ] **App Registration** : un seul Azure AD multi-tenant ou un par cabinet (Enterprise) ?
- [ ] **Coûts Microsoft Graph** : gratuit pour les opérations courantes, mais quid des subscriptions massives ?
- [ ] **Boîtes partagées vs déléguées** : différences de permissions Graph, à clarifier
- [ ] **Synchronisation contacts Outlook** ↔ `crm.contact` : utile en Phase 2 ?
- [ ] **Mode "Connect to inbox only"** vs "Full access" : permettre une granularité utilisateur ?
