---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
flow: E
depends_on: [salaire, dashboard-client, calendar, multi-tenant, payroll-integration]
referenced_by: [salaire, calendar, dashboard-client]
---

# Flow E — Cycle mensuel de validation salaires

> Flow utilisateur : cycle mensuel récurrent où le contact RH client valide les éléments de paie du mois, le cabinet revoit, puis exporte vers le logiciel de paie.
>
> Voir la spec produit complète dans [`/docs/modules/salaire.md`](../modules/salaire.md).

## Déclencheur
Automatique : génération mensuelle d'une `salaire.periode` selon les templates d'échéances configurés (`calendar.template_echeance` de type `salaire_mensuel`).

## Acteurs
- **Système ZARYA** : génération période, prepopulation, exports
- **Contact RH client** (Aïcha) : valide les éléments paie
- **Gestionnaire salaires cabinet** (Marc) : revoit, valide, exporte
- **Logiciel paie cible** (Bexio Payroll, Crésus, etc.) : récepteur final

## Pré-requis
- Client actif avec service `salaires` activé
- Référentiel employés initialisé (Flow G complété)
- `salaire.acces_client` actif pour au moins un contact RH
- Date de validation cabinet définie (typiquement 25 du mois)

## Étapes détaillées

### Étape 1 — Génération de la période (J-10 typique)
Job pg_cron mensuel :
1. Pour chaque client avec service salaires actif :
   - Vérification qu'il n'existe pas déjà de période pour le mois
   - Création `salaire.periode` (statut `creation`)
   - Calcul des dates : `date_validation_client`, `date_validation_cabinet`, `date_export`
2. Génération `crm.echeance` liée
3. Notification email au contact RH client J-10

### Étape 2 — Prepopulation des éléments paie
Pour chaque période créée :
1. Récupération des employés actifs (`salaire.employe.statut = 'actif'`)
2. Pour chaque employé : génération `salaire.element_paie` avec les valeurs récurrentes
   - Salaire de base
   - Primes contractuelles
   - Déductions standard
3. Détection des changements via `salaire.changement` non encore appliqués
   - Embauches récentes
   - Départs récents
   - Modifications de salaire
   - Avenants
4. Période passe en statut `prepopulee`

### Étape 3 — Notification contact RH
1. Email J-10 : "Votre validation salaire pour [mois] est ouverte"
2. Email J-5 : rappel si pas encore validé
3. Email J-2 : rappel ferme
4. Lien magic / login vers le dashboard client

### Étape 4 — Validation par le contact RH (Aïcha)
1. Aïcha se connecte au dashboard client (mobile-first)
2. Action prioritaire affichée : "Valider salaires de [mois]"
3. Vue d'ensemble : N employés, montant total, anomalies détectées
4. Pour chaque employé :
   - Affichage des éléments paie (salaire base, primes, déductions)
   - Champs éditables (heures supplémentaires, primes ponctuelles, absences)
   - Pre-detection d'anomalies (montant inhabituel vs M-1, absences répétées)
   - Validation 1-clic si tout est OK
   - Édition inline sinon
5. Aïcha peut faire des modifications en plusieurs sessions (sauvegarde temps réel)
6. Au "Valider tout" : période passe en statut `validee_client`

### Étape 5 — Notification cabinet
1. Email à Marc : "Validation client reçue pour [client X], en attente de votre revue"
2. Action visible dans son dashboard

### Étape 6 — Revue par le gestionnaire cabinet (Marc)
1. Marc ouvre la période
2. Affichage du delta : Aïcha a modifié quoi vs prepopulation
3. Vérifications :
   - Anomalies détectées par ZARYA
   - Cohérence avec les changements RH attendus
   - Respect des règles cabinet (heures max, primes plafonnées)
4. 3 actions possibles :
   - **Valider** : tout est OK
   - **Demander correction** : retour à Aïcha avec commentaire
   - **Modifier puis valider** : Marc ajuste lui-même (avec audit log)
5. Au "Valider" : période passe en statut `validee_cabinet`

### Étape 7 — Export vers le logiciel paie
Lookup configuration cabinet (`facture.mapping_export` ou équivalent salaire) :

**Cas A : Pattern API (Bexio Payroll)**
1. Création / update des employés Bexio si nécessaire
2. Push des éléments paie de la période
3. Génération côté Bexio des bulletins
4. Récupération des IDs Bexio, stockage côté ZARYA
5. Période passe en statut `exportee`

**Cas B : Pattern fichier (Crésus Salaires, WinBIZ)**
1. Génération du fichier au format Crésus / WinBIZ
2. Stockage Supabase Storage
3. Notification Marc : "Fichier d'export disponible"
4. Marc télécharge et importe dans son logiciel
5. Bouton "Marquer exportée" pour confirmer

**Cas C : Pattern Excel humain (fallback)**
1. Génération Excel formaté
2. Marc télécharge et ressaisit manuellement
3. Bouton "Marquer exportée"

### Étape 8 — Génération des bulletins (Phase 2)
Hors-scope MVP : la génération formelle des bulletins est faite par le logiciel paie cible (Bexio, Crésus). ZARYA fournit les données validées.

En Phase 2 : génération native ZARYA possible si le logiciel cible ne le fait pas (ou si demande).

### Étape 9 — Distribution aux employés
- Phase 1 : le logiciel paie cible gère la distribution
- Phase 2 : option ZARYA d'envoi des bulletins individuels par email aux employés

### Étape 10 — Clôture de la période
1. `salaire.periode.statut = 'cloturee'`
2. Création `crm.evenement` (type `periode_salaire_cloturee`)
3. Archivage des bulletins dans `doc.document` lié à la période
4. Préparation de la prochaine période (M+1)

## Cas d'erreur

| Cas | Comportement |
|---|---|
| Aïcha ne valide pas dans les délais | Relances automatiques, escalade vers cabinet à J+2 |
| Anomalie majeure détectée | Validation client impossible, contact cabinet obligatoire |
| Bexio API échoue à l'export | Retry x3, puis bascule sur pattern fichier |
| Employé ajouté dans la période | Sous-flow embauche (référentiel à compléter) |
| Marc rejette la validation Aïcha | Notification Aïcha avec commentaire, retour étape 4 |
| Période déjà clôturée modifiée | Création d'un avenant de paie (Phase 2), pas modification rétroactive |

## Cas particuliers

### Premier mois après onboarding
- Pas de prepopulation (pas d'historique)
- Aïcha saisit tout
- Validation cabinet plus rigoureuse (vérification référentiel)

### Embauche en cours de mois
- Période existante : ajout possible jusqu'à la validation
- Calcul prorata automatique (jour d'entrée → fin du mois)

### Départ en cours de mois
- Calcul du solde (vacances, 13e, etc.) selon paramétrage cabinet
- Génération du certificat de salaire (Phase 2)

### Modification d'un changement non encore appliqué
- Si `salaire.changement` créé mais pas encore "absorbé" dans la période courante
- Application au mois N ou N+1 selon la date effective

### Multi-contacts RH
- Plusieurs contacts RH peuvent valider en parallèle (last-write-wins)
- Affichage de qui a fait quoi

### Vacances Aïcha
- `calendar.pause_client` actif → relances pausées
- Notification cabinet "Client en pause, action requise de votre part"

## Performance et résilience

### Volumes typiques
- 1 période par client par mois × 100 clients par cabinet = 100 périodes/mois/cabinet
- 5-50 employés par client → 500-5000 éléments paie par cabinet/mois
- Pic d'activité 20-25 du mois (deadlines cabinet)

### Optimisations
- Pre-population batch en début de mois (off-peak)
- Notifications email regroupées (digest)
- Export batch hebdomadaire ou mensuel selon préférence cabinet

## Sécurité

### Audit complet
Chaque action loggée dans `audit.cabinet_evenement` :
- Création de la période (système)
- Validation par contact RH (avec IP, user_agent)
- Modifications avec diff avant/après
- Validation cabinet
- Export (destinataire, format, statut)
- Clôture

### Permissions
- Contact RH client : accès aux salaires de **son** client uniquement
- Gestionnaire salaires cabinet : accès complet à tous les clients du cabinet
- Collaborateur cabinet : accès limité (visualisation, pas de validation)

### Données envoyées
- Push Bexio : données validées uniquement, traçabilité côté Bexio
- Conformité nLPD : les salaires restent en UE / Suisse selon le plan

## Métriques à instrumenter

- Taux de validation client dans les délais (cible > 80%)
- Délai moyen validation client → validation cabinet (cible < 24h)
- Nombre de retours (rejet cabinet) par client (signal de qualité référentiel)
- Taux d'anomalies détectées (vraies vs fausses positives)
- Taux d'export réussi par pattern (API vs fichier vs manuel)
- Volume LLM par cycle (détection anomalies, suggestions)

## Dépendances code

- Module Salaire ([`salaire.md`](../modules/salaire.md))
- Module Dashboard Client ([`dashboard-client.md`](../modules/dashboard-client.md))
- Module Calendar ([`calendar.md`](../modules/calendar.md))
- Intégration paie ([`payroll-integration.md`](../architecture/payroll-integration.md))
- Schéma salaire ([`salaire-schema.md`](../data-model/salaire-schema.md))
