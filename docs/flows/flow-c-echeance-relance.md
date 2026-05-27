---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
flow: C
depends_on: [calendar, crm, multi-tenant, microsoft-integration]
referenced_by: [calendar]
---

# Flow C — Échéance et relance

> Flow utilisateur : une échéance approche, ZARYA génère un brouillon de relance, le gestionnaire valide, l'email part vers le client, la réponse est tracée.
>
> Voir la spec produit complète dans [`/docs/modules/calendar.md`](../modules/calendar.md).

## Déclencheur
Une échéance passe en statut `imminente` (date_alerte atteinte), avec au moins un document attendu manquant.

## Acteurs
- **Système ZARYA** : génération brouillon, envoi (selon politique)
- **Gestionnaire cabinet** (Marc ou Julie) : validation des brouillons
- **Contact RH client** (Aïcha) : destinataire des relances, possibles réponses

## Pré-requis
- Au moins une échéance active sur un client
- Templates d'emails configurés (héritage ZARYA ou personnalisés)
- Intégration Microsoft Graph active (pour l'envoi)
- Politique de relance définie pour le cabinet

## Étapes détaillées

### Étape 1 — Détection de l'échéance imminente
Job pg_cron horaire :
1. SELECT échéances avec `statut = 'a_venir'` AND `date_alerte <= now()`
2. Pour chaque : transition `a_venir` → `imminente`
3. Création `crm.evenement` (type `echeance_imminente`)

### Étape 2 — Détection des documents manquants
Pour chaque échéance imminente :
1. Lookup `echeance.document_attendu_ids[]`
2. Pour chaque document attendu : vérifier si reçu pour la période courante
3. Si tous reçus → `echeance.statut = 'traitee'`, pas de relance
4. Sinon → liste des documents manquants à mentionner dans la relance

### Étape 3 — Vérification des pauses
Avant de générer une relance :
1. Lookup `calendar.pause_client` pour le client → si pause active, skip
2. Vérification client a répondu récemment (dans `pause_apres_reponse_jours`) → skip
3. Vérification réunion planifiée dans `pause_si_reunion_jours` → skip
4. Vérification fermeture cabinet (`calendar.cabinet_config.fermetures_annuelles`) → skip

Si une condition de pause s'applique : `pause_recommandee_par_systeme = true`, log mais pas de génération.

### Étape 4 — Génération du brouillon de relance
1. Sélection du template d'email approprié :
   - Lookup `crm.modele_email` avec contexte = `relance_document` ou `relance_echeance`
   - Langue = `client.langue`
   - Cabinet override si présent, sinon template ZARYA global
2. Interpolation des variables :
   - `{{client.raison_sociale}}`, `{{contact.prenom}}`, `{{contact.nom}}`
   - `{{echeance.libelle}}`, `{{echeance.date_echeance}}`
   - `{{documents_manquants}}` (liste formatée)
   - `{{cabinet.raison_sociale}}`, `{{membre.signature}}`
3. Application de la signature cabinet (ou personnelle du gestionnaire)
4. Numérotation : `relance.numero_dans_serie = N+1` (N = relances précédentes)
5. Création `crm.relance` en statut `brouillon`

### Étape 5 — Décision selon politique cabinet
Lookup `calendar.cabinet_config.politique_relance_defaut` (override possible par type) :

**Mode A — Validation humaine systématique (défaut MVP)**
- `relance.statut = 'brouillon'`
- Apparition dans la file de validation (`calendar.v_relances_a_valider`)
- Notification au gestionnaire dans le digest

**Mode B — Auto-envoi pour les premières relances**
- Si `numero_dans_serie <= 1` → auto-envoi (étape 6 direct)
- Sinon → file de validation

**Mode C — Auto-envoi complet**
- Auto-envoi (étape 6) sauf si :
  - Anomalie détectée (montant inhabituel, IBAN changé)
  - Limite atteinte (`max_relances_avant_escalade`)

### Étape 6 — Validation humaine (modes A et B au-delà N°1)
1. Marc ou Julie ouvre la file `v_relances_a_valider`
2. Aperçu : destinataire, sujet, corps généré
3. 4 actions possibles :
   - **Envoyer** : 1-clic, envoi immédiat
   - **Modifier puis envoyer** : édition inline du corps/sujet
   - **Reporter** : reporter la relance de N jours
   - **Annuler** : motif requis, l'échéance reste mais pas de relance pour cette série
4. Validation en lot possible : "Envoyer tout" pour les brouillons standards

### Étape 7 — Envoi de l'email
1. Appel à Microsoft Graph `POST /me/sendMail` avec l'auth du cabinet
2. **Identité de l'expéditeur** : adresse du cabinet (cabinet@example.ch), pas ZARYA
3. Cible : `destinataire_contact_id` → email du `crm.contact`
4. Stockage du `microsoft_message_id` retourné
5. `relance.statut = 'envoyee'`, `date_envoi = now()`
6. Log dans `crm.evenement` (type `relance_envoyee`)
7. Log dans `audit.cabinet_evenement`

### Étape 8 — Sync calendrier Outlook
Création/mise à jour d'un événement dans le calendrier du responsable du client :
1. Lookup `calendar.evenement_outlook` existant pour l'échéance
2. Si absent : POST `/me/events` Microsoft Graph
3. Stockage `outlook_event_id`, `outlook_etag`
4. Mise à jour `outlook_sync_statut = 'synchronise'`

### Étape 9 — Tracking de la réponse
**9.A — Lecture détectée** (si MS Graph remonte read receipt)
- Webhook reçu → update `relance.email_lu_at`
- Pas d'effet immédiat, juste tracking

**9.B — Réponse reçue (email entrant)**
1. Flow A (Document entrant) ingère l'email
2. Détection : `In-Reply-To` header pointe vers un email ZARYA
3. Lookup `relance.microsoft_message_id`
4. Lien établi : `relance.reponse_recue_email_brut_id`
5. Mise à jour `relance.statut = 'repondue'`
6. Mise à jour `echeance.derniere_activite_client = now()`
7. Pause automatique des prochaines relances pour `pause_apres_reponse_jours`

**9.C — Document reçu (sans email de réponse)**
- Si le client envoie directement les documents (Flow A) → trigger validation Doc
- À la validation, si le document couvre un `document_attendu` de l'échéance :
  - Mise à jour `document_attendu.statut_periode_courante = 'recu'`
  - Si tous les documents reçus → `echeance.statut = 'traitee'`
  - Annulation des relances futures pour cette échéance

### Étape 10 — Escalade après relances multiples
Si `relance_count >= max_relances_avant_escalade` (3 par défaut) :
1. Pas de nouvelle relance auto
2. Notification au responsable cabinet (`client.responsable_id`)
3. Création `crm.evenement` (type `echeance_escaladee`)
4. Suggestion d'action manuelle dans l'UI : "Appel téléphonique recommandé"

### Étape 11 — Échéance en retard
Si `date_echeance < now()` ET statut toujours `imminente` :
1. Transition `imminente` → `en_retard`
2. Recalcul `crm.risque.score` (en_retard pondère lourdement)
3. Apparition dans le dashboard responsable comme "en retard"
4. Continuation des relances jusqu'à escalade

## Cas d'erreur

| Cas | Comportement |
|---|---|
| Microsoft Graph indisponible | Retry x3, queue de rattrapage, notification cabinet |
| Token expiré | Refresh auto, si échec → notification "Reconnectez Microsoft 365" |
| Adresse email invalide | Brouillon en erreur, alerte à Marc, suggestion de mise à jour contact |
| Template manquant | Fallback sur template ZARYA générique, alerte cabinet |
| Variables non résolues (`{{...}}` non remplacé) | Brouillon en erreur, validation humaine obligatoire |
| Pause en conflit avec urgence | Pause appliquée, mais alerte responsable si urgence haute |
| Outlook sync échoue | Logged, retry, pas de blocage de l'envoi email |

## Cas particuliers

### Plusieurs contacts RH à relancer
Si plusieurs `crm.contact` avec `est_contact_rh = true` :
- Politique cabinet : un seul (principal) ou tous en copie ?
- Configurable dans `cabinet_config`

### Échéance traitée partiellement
Si 3 docs requis, 2 reçus, 1 manquant :
- Relance ciblée sur le doc manquant uniquement
- Template adapté ("Il reste le document X")

### Client qui répond "Je le ferai demain"
Détection IA légère du contenu de la réponse → suggestion de pause de 2 jours.

### Client en vacances
Le contact RH a déclaré sa pause dans le dashboard (`calendar.pause_client`). Aucune relance pendant la période.

### Multiples échéances simultanées
Le même contact RH peut avoir plusieurs échéances. Politique cabinet :
- Un email par échéance (défaut)
- Ou regroupement hebdomadaire (Phase 2)

## Points d'extension Phase 2+

- **Calendrier cantonal officiel** synchronisé pour les dates fiscales
- **SMS** comme canal alternatif pour les urgences
- **WhatsApp Business** (validation client final pas évidente)
- **Adaptation du ton** par IA selon historique relationnel
- **Prévision de charge** pour le cabinet
- **Visio intégrée** pour les réunions
- **Notification push mobile** dans le dashboard client

## Métriques à instrumenter

- Volume de relances envoyées par cabinet et par mois
- Taux de validation 1-clic vs corrections
- Taux d'auto-envoi (si politique aggressive)
- Taux de réponse moyen (J+1, J+3, J+7)
- Taux de relances aboutissant à la complétion vs escalade
- Taux d'utilisation des pauses client
- Latence détection échéance imminente → brouillon généré (cible < 5 min)
- Latence brouillon validé → email parti (cible < 30 sec)

## Dépendances code

- Module Calendar ([`calendar.md`](../modules/calendar.md))
- Module CRM ([`crm.md`](../modules/crm.md))
- Module Doc ([`doc.md`](../modules/doc.md)) pour le tracking des réponses
- Intégration Microsoft ([`microsoft-integration.md`](../architecture/microsoft-integration.md))
- Schéma échéance ([`echeance-schema.md`](../data-model/echeance-schema.md))
