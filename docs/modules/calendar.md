---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: calendar
depends_on: [crm, multi-tenant, doc, microsoft-integration]
referenced_by: [doc, salaire, dashboard-client]
---

# Zarya Calendar — Échéances et relances

## 1. Rôle dans le produit

**Zarya Calendar** orchestre **toutes les échéances** des dossiers clients (fiscales, TVA, salariales, bouclements) et déclenche les **relances** au bon moment, vers les bons contacts, avec validation humaine quand nécessaire.

C'est le module qui résout deux douleurs majeures :
- Sophie : "Je ne sais pas quels dossiers sont en retard"
- Marc : "Je passe mes journées à relancer les clients"

**Promesse produit** : aucune échéance manquée, aucune relance écrite manuellement, mais validation humaine systématique avant envoi.

**Multi-tenant** : échéances et relances scopées par `cabinet_id`. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Types d'échéances

### 2.1 Échéances légales (générées automatiquement)

**Fiscales suisses** :
- Déclaration impôt entreprise (cantonale + fédérale)
- Déclaration impôt employé (certificats de salaire annuels)
- Bouclement annuel

**TVA** :
- Déclarations trimestrielles ou semestrielles selon régime
- Décompte selon méthode (effective, taux de la dette fiscale nette, forfait)

**Salaires** :
- Validation mensuelle des éléments paie
- Décomptes annuels AVS, LPP, AC, IS
- Certificats de salaire fin d'année

**Sociales** :
- Cotisations AVS trimestrielles
- LPP annuel
- Assurance accident annuelle

### 2.2 Échéances cabinet (paramétrables)
Définies par le cabinet selon ses services :
- Relances documents périodiques (relevés bancaires mensuels)
- Réunions clients régulières
- Renouvellement de mandat
- Délais internes (préparation TVA avant J-5)

### 2.3 Échéances ponctuelles
- Demande de renseignement AFC avec date butoir
- Procédure de contrôle TVA
- Engagement contractuel ponctuel

## 3. Sources de génération

### 3.1 Templates par service
Quand un client active un service (TVA, salaires, fiscalité), ZARYA génère **automatiquement** les échéances récurrentes associées.

Exemple : activation du service `salaires` mensuel sur un client →
- Création de 12 échéances annuelles "Validation salaires mois X"
- Date d'échéance configurée par le cabinet (typiquement le 15 ou 20 du mois)
- Date d'alerte = échéance - N jours

### 3.2 Triggers depuis Doc
Un document reçu peut **annuler ou ajuster** une échéance :
- Relevé bancaire d'avril reçu → échéance "Relance relevé avril" annulée
- Confirmation TVA acceptée → échéance "Soumission TVA Q1" marquée traitée

### 3.3 Création manuelle
Le collaborateur peut créer une échéance ad hoc :
- "Rappeler le client X le 15 juin pour le bouclement"
- "Préparer la réunion annuelle avec client Y"

### 3.4 Externe (calendriers cantonaux)
**Phase 2** : intégration de calendriers cantonaux pour récupérer les dates fiscales officielles à jour (varient selon cantons).

## 4. Cycle de vie d'une échéance

```
[Création]
   ↓
   à_venir
   ↓ (date_alerte atteinte)
   imminente
   ↓
   ┌─────────────────────────────────┐
   │ Plusieurs scénarios :           │
   │                                 │
   │ A. Documents complets reçus →   │
   │    traitee                      │
   │                                 │
   │ B. Documents manquants →        │
   │    déclenche relance automatique│
   │                                 │
   │ C. Décalage justifié →          │
   │    reportee (nouvelle date)     │
   │                                 │
   │ D. Annulation →                 │
   │    annulee                      │
   └─────────────────────────────────┘
   ↓ (date_echeance dépassée sans traitement)
   en_retard
   ↓
   (escalade automatique : alerte responsable)
```

### États possibles
- `a_venir` : créée mais date_alerte non atteinte
- `imminente` : alerte déclenchée, action attendue
- `en_retard` : date dépassée sans traitement
- `traitee` : action accomplie (preuve dans Doc)
- `reportee` : décalée avec motif et nouvelle date
- `annulee` : non applicable (motif requis)

## 5. Logique de relance

### 5.1 Déclenchement
Quand une échéance approche et qu'un document est manquant :
- ZARYA identifie le `crm.document_attendu` non encore reçu
- Identifie le contact à relancer (`est_contact_rh` ou contact principal du client)
- Compose un email de relance depuis le template du cabinet

### 5.2 Composition du contenu
Pipeline :
1. Sélection du template d'email approprié (langue × contexte)
2. Interpolation des variables (`{{client.nom}}`, `{{document.type}}`, `{{echeance.date}}`)
3. Personnalisation IA légère : adaptation du ton selon l'historique relationnel (formel/cordial/insistant)
4. Signature du cabinet appliquée
5. Stockage en `brouillon` dans `crm.relance`

### 5.3 Validation et envoi
Trois modes (configurables au niveau cabinet) :

**Mode A — Validation humaine systématique (défaut MVP)**
- Brouillon créé → notification au gestionnaire
- Affichage côté Calendar : "1 relance à valider"
- Validation 1-clic OU correction du texte
- Envoi via Microsoft Graph

**Mode B — Auto-envoi pour les premières relances**
- Relance N°1 envoyée automatiquement
- Relance N°2+ nécessite validation humaine
- Tracé dans audit

**Mode C — Auto-envoi complet (avec garde-fous)**
- Toutes les relances envoyées sans validation
- Garde-fous : pas plus de N relances par client par mois, pause si client a répondu récemment

### 5.4 Escalade
Après N relances sans réponse (configurable, 3 par défaut) :
- Plus de relance auto
- Alerte au responsable cabinet
- Suggestion : "Contacter par téléphone" ou "Escalader au dirigeant client"

### 5.5 Pause intelligente
Pas de relance si :
- Le client a répondu (à n'importe quel email cabinet) dans les 48h
- Une réunion est planifiée avec le client dans les 7 jours
- Le client est marqué "vacances" jusqu'à date X

## 6. Interface utilisateur

### 6.1 Vue calendrier (mois)
Vue principale, jours du mois en grille.

Chaque jour affiche :
- Pastilles colorées : nb d'échéances par état (à venir, imminentes, en retard)
- Au survol : aperçu des échéances du jour
- Au clic : drawer latéral avec détails

### 6.2 Vue liste (filtrable)
Tableau alternatif :

| Date | Client | Type | Service | Statut | Responsable | Actions |
|---|---|---|---|---|---|---|
| 15.06 | Dupont SA | TVA | TVA | imminente | Marc | [Détails] |
| 16.06 | Martin SARL | Salaires | Salaires | à venir | Marc | [Détails] |

Filtres :
- Par responsable
- Par client
- Par type
- Par statut
- Par range de dates

### 6.3 Vue détail échéance
Drawer ou page dédiée :
- Récap (client, type, dates, responsable)
- Documents requis (avec statut : reçu / manquant)
- Historique des relances envoyées
- Actions : "Marquer traitée", "Reporter", "Annuler", "Créer relance manuelle"

### 6.4 File des relances à valider
Vue dédiée pour Marc/Julie :

```
┌──────────────────────────────────────────────────┐
│ 📧 Relances à valider (8)                        │
├──────────────────────────────────────────────────┤
│ ☐ Client X — Relevés avril manquants             │
│   À : aïcha@clientx.ch                           │
│   Sujet : Rappel — Relevés bancaires d'avril     │
│   [Aperçu] [✓ Envoyer] [✏️ Modifier] [⏭ Plus tard]│
├──────────────────────────────────────────────────┤
│ ☐ Client Y — Validation salaires mai             │
│   À : patrick@clienty.ch                         │
│   Sujet : Validation des salaires du mois        │
│   [Aperçu] [✓ Envoyer] [✏️ Modifier] [⏭ Plus tard]│
└──────────────────────────────────────────────────┘
```

Validation en lot possible : "Envoyer tout" si tous les emails sont OK.

### 6.5 Sync Outlook
Les échéances sont synchronisées vers le calendrier Outlook du cabinet :
- Création automatique d'événements dans le calendrier du responsable
- 2-way sync : modifications dans Outlook propagées vers ZARYA
- Voir [`microsoft-integration.md`](../architecture/microsoft-integration.md)

## 7. Personnalisation par cabinet

### 7.1 Templates de relance
Voir module CRM + onboarding fiduciaire pour le système d'héritage.

Variables disponibles dans les templates :
- Identité : `{{client.raison_sociale}}`, `{{contact.prenom}}`, `{{contact.nom}}`
- Échéance : `{{echeance.libelle}}`, `{{echeance.date}}`
- Document : `{{document.type}}`, `{{document.periode}}`
- Cabinet : `{{cabinet.raison_sociale}}`, `{{membre.nom}}`
- Conditionnels : `{{#if relance_count > 1}}`

### 7.2 Délais d'alerte
Configurable par cabinet et par type d'échéance :
- TVA : alerte à J-7
- Salaires : alerte à J-5
- Bouclement : alerte à J-30

### 7.3 Fréquence des relances
Cadence personnalisable :
- 1ère relance : J-5
- 2ème relance : J-2
- 3ème relance : J+1 (passée)
- Au-delà : escalade

### 7.4 Politique de validation
Voir § 5.3.

## 8. Notifications

### 8.1 Vers le cabinet
- **Daily digest** matinal : "5 échéances à traiter aujourd'hui, 3 relances à valider"
- **Alertes urgentes** : échéance critique en retard, escalade nécessaire
- **Récap hebdo** : vue d'ensemble pour Sophie

### 8.2 Vers le client final (via dashboard et email)
- Notification de validation salaire requise (1 fois par cycle)
- Relance documents manquants (selon politique cabinet)
- Confirmation de traitement (rassurer le client)

### 8.3 Vers Outlook
Sync calendrier décrit en § 6.5.

## 9. Modèle de données

Voir [`echeance-schema.md`](../data-model/echeance-schema.md) (à créer sprint suivant).

Tables principales (déjà esquissées dans `crm-schema.md`) :
- `crm.echeance` : l'échéance elle-même
- `crm.relance` : les emails de relance envoyés
- `crm.modele_email` : templates utilisés

Tables additionnelles à créer :
- `calendar.template_echeance` : templates récurrents (TVA, salaires, etc.)
- `calendar.evenement_outlook` : sync avec Microsoft Graph

## 10. Performance et volumétrie

### 10.1 Volumes typiques par cabinet
- 50-200 clients × 5-15 échéances/an = 250 à 3000 échéances/an
- 100-500 relances envoyées/mois

### 10.2 Génération automatique
Job nightly (`pg_cron`) :
- Création des échéances à venir (3 mois glissants)
- Mise à jour des statuts (passage de `a_venir` à `imminente`)
- Génération des brouillons de relance pour validation

### 10.3 Latences
- Création d'une relance : < 5 secondes (avec IA légère)
- Envoi (Microsoft Graph) : 1-3 secondes
- Sync Outlook : asynchrone, < 30 secondes

## 11. Effets de bord

### 11.1 Module CRM
- Mise à jour `crm.client.statut` selon état des échéances
- Recalcul `crm.risque.score`
- Création `crm.evenement` (type `echeance_creee`, `relance_envoyee`, etc.)

### 11.2 Module Doc
- Annulation des relances dont les documents sont reçus
- Mise à jour des `document_attendu` couverts par une échéance traitée

### 11.3 Module Salaire
- Échéances mensuelles trigger le workflow de validation salaire
- Voir [`salaire.md`](./salaire.md)

### 11.4 Module Dashboard Client
- Affichage de l'action prioritaire (échéance imminente)
- Notifications email reçues par le contact RH

## 12. Audit et conformité

### 12.1 Traçabilité
Chaque échéance log :
- Création (auto/manuel, source)
- Modifications (statut, date, responsable)
- Relances envoyées (timestamps, destinataires)
- Traitement final

### 12.2 Preuves
Une échéance "traitée" doit pouvoir afficher la **preuve** :
- Document reçu et classé
- Email de confirmation
- Action manuelle avec justificatif

Important pour les audits fiduciaires (révision périodique des cabinets).

### 12.3 Litige client
En cas de litige ("Vous ne m'avez jamais relancé !"), l'historique complet est consultable :
- Tous les emails envoyés (Microsoft Graph les conserve aussi)
- Réponses reçues
- Décisions de pause / relance

## 13. UX et productivité

### 13.1 Action prioritaire visible
Le dashboard fiduciaire affiche en permanence : **"X échéances à traiter aujourd'hui"**.

Au clic, accès direct à la file de validation.

### 13.2 Raccourcis
Pour Marc et Julie :
- **E** : aller à la file d'échéances
- **R** : aller à la file de relances à valider
- **V** : valider l'élément sélectionné
- **N** : suivant

### 13.3 Vue mobile
Phase 2. MVP focus desktop.

## 14. Cas particuliers

### 14.1 Échéances cantonales
Certaines échéances varient selon le canton du client (Vaud vs Genève). À gérer via `crm.client.canton` + table de référence.

### 14.2 Régimes TVA
La fréquence TVA dépend du régime du client (effective trimestriel vs annuel forfait). La génération d'échéances doit en tenir compte.

### 14.3 Multi-langues
Les emails de relance doivent être dans la langue du contact, pas du cabinet.

### 14.4 Vacances cabinet
Si tout le cabinet est en vacances (fermeture annuelle), pas de relances automatiques. Configuration via "période de fermeture cabinet" dans les paramètres.

### 14.5 Vacances client
Le contact RH peut signaler "absent jusqu'au X" dans son dashboard. Relances suspendues jusqu'à cette date.

## 15. Hors-scope MVP

- **Calendrier officiel cantonal** synchronisé (Phase 2)
- **Intégration avec d'autres calendriers** (Google Calendar)
- **Notifications SMS/WhatsApp** (Phase 2)
- **Visio intégrée** pour réunions clients
- **Tâches collaboratives** complexes (assignation, sous-tâches)
- **Automatisation conditionnelle** avancée (si X alors Y alors Z)
- **Prévision de charge** (combien d'échéances dans 2 semaines, équipe sous-staffée ?)

## 16. Questions ouvertes

> **Tranchées dans l'ADR 0011 — Périmètre MVP du module Calendar** (30 mai 2026).
> Voir `docs/architecture/decisions/0011-calendar-mvp-scope.md`.

- [x] **Granularité des templates** → par contexte × langue (pas par canton) : ~12 seed FR/DE/IT. (ADR 0011 §3)
- [x] **Politique de pause** → pause auto 7 jours ouvrés après réponse client, configurable. (ADR 0011 §5)
- [x] **Tonalité IA** → templates simples au MVP, IA `chat_small` en surcouche optionnelle. (ADR 0011 §4)
- [x] **Échéances cantonales** → table seed interne versionnée (fédéral + cantons des premiers clients). (ADR 0011 §9)
- [x] **Régimes TVA** → saisie manuelle dans `crm.param_comptable` (Bexio = Phase 2). (ADR 0011 §10)
- [x] **Intégration Outlook** → calendrier individuel du responsable, 1-way au MVP. (ADR 0011 §7)
- [x] **Bulk relances** → plafond configurable défaut 50/envoi + throttle ~30 mails/min. (ADR 0011 §6)
- [x] **Sync calendrier client** → non au MVP (candidat Phase 2). (ADR 0011 §11)
