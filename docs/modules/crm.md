---
status: draft
owner: tristan
last_updated: 2026-05-26
module: crm
priority: P0
depends_on: []
referenced_by: [doc, calendar, facture, salaire, search]
---

# Zarya CRM — Centre de vérité

## 1. Rôle dans l'architecture

Le CRM n'est pas un module parmi d'autres. C'est **l'unique source de vérité** sur les clients, leurs services, leurs obligations et leur état. Tous les autres modules :

- **lisent** le CRM pour savoir quoi faire (Doc → quel client ? Calendar → quelle échéance ? Salaire → quel client a le service actif ?)
- **écrivent** dans le CRM pour mettre à jour l'état (Doc → document reçu, Facture → anomalie détectée, Calendar → relance envoyée)

**Règle invariante** : aucune information opérationnelle sur un client ne vit ailleurs que dans le CRM. Pas de duplication, pas de "checklist locale" dans Calendar, pas de "préférences client" dans Doc.

## 2. Objectif utilisateur

Permettre au responsable fiduciaire et aux collaborateurs de :

1. **Savoir** instantanément l'état d'un dossier client (complet, incomplet, en retard, à risque)
2. **Agir** en priorité sur les clients qui en ont besoin (filtres + score de risque)
3. **Configurer** ce qui est attendu de chaque client (services, documents, fréquences)
4. **Tracer** tout ce qui s'est passé avec un client (historique consolidé)

## 3. Personas concernés

| Persona | Usage CRM |
|---|---|
| Responsable fiduciaire | Vue d'ensemble, pilotage du risque, configuration des mandats |
| Collaborateur comptable | Consultation fiche, mise à jour checklist, ajout de notes |
| Gestionnaire salaires | Filtre clients service salaire, suivi validations |
| Client final | Aucun accès direct (peut-être Phase 3 : portail client) |

## 4. Écrans

### 4.1 Liste clients
- Tableau filtrable et triable
- Colonnes par défaut : raison sociale, type, statut dossier, prochaine échéance, score risque, responsable
- Filtres rapides (sauvegardables) :
  - Documents manquants
  - Échéance < 30 jours
  - Service salaire actif
  - Risque élevé
  - Mandats inactifs / archivés
  - Prospects
- Action principale : ouvrir fiche
- Actions de masse : relancer, exporter, changer responsable

### 4.2 Fiche client
Structure en onglets ou sections déroulantes :

1. **Identité & relation** — coordonnées, mandat, responsable
2. **Services** — comptabilité, fiscalité, salaires, TVA, bouclement, conseil
3. **Paramètres comptables** — logiciel, plan, fréquence, bouclement
4. **Documents attendus** — checklist avec statut par document
5. **Échéances** — calendrier dédié au client
6. **Salaires** — si service actif (sinon masqué)
7. **Historique** — événements, communications, documents reçus
8. **Risque** — score, drapeaux, recommandations

### 4.3 Prospects
- Liste séparée des clients actifs
- Champs allégés (identité, source, statut commercial, prochaine action)
- Conversion en client actif = activation du mandat → bascule sur fiche client complète

### 4.4 Configuration globale
- Modèles de checklist par type de client (PME / indépendant / association)
- Modèles de service (ex. "Pack comptabilité trimestrielle")
- Modèles d'échéances récurrentes
- Modèles d'emails de relance

## 5. Actions principales

| Action | Déclencheur | Effet |
|---|---|---|
| Créer client | Manuel ou conversion prospect | Crée fiche, applique modèle selon type |
| Activer / désactiver service | Bouton sur fiche | Active/désactive checklist, échéances, modules liés |
| Marquer document reçu | Auto (depuis Doc) ou manuel | Met à jour checklist, recalcule risque |
| Marquer document non applicable | Manuel | Sort le doc de la checklist sans pénalité de risque |
| Reporter échéance | Manuel avec motif | Décale échéance, log dans historique |
| Recalculer risque | Auto (trigger) ou manuel | Met à jour score |
| Archiver client | Manuel | Désactive échéances et relances, garde historique |
| Ajouter note | Manuel | Note datée + auteur, visible dans historique |

## 6. États et statuts

### États de la relation client
- `prospect` — pas encore signé
- `actif` — mandat en cours
- `inactif` — mandat suspendu (à recontacter)
- `archive` — mandat terminé

### Statuts dossier (calculés)
- `complet` — tous documents attendus reçus, aucune échéance dépassée
- `incomplet` — au moins un document attendu non reçu mais pas en retard
- `en_retard` — au moins un document/échéance dépassé
- `a_risque` — score de risque > seuil

### Statut document attendu
- `recu` — document classé dans la période
- `manquant` — attendu mais non reçu, période en cours
- `en_retard` — attendu, non reçu, période dépassée
- `non_applicable` — explicitement marqué inutile pour ce client

## 7. Score de risque

Score calculé entre 0 et 100, recalculé à chaque événement client.

**Facteurs (pondérations indicatives, à calibrer)** :

| Facteur | Poids |
|---|---|
| Documents en retard (nombre) | +15 par doc |
| Échéance dépassée | +20 par échéance |
| Échéance < 7 jours sans action | +10 |
| Relances sans réponse (cumul) | +5 par relance |
| Anomalies factures non résolues | +10 par anomalie |
| Dernière activité > 60 jours | +15 |
| Mandat signé < 90 jours | -10 (client nouveau, tolérance) |

**Seuils visuels** :
- 0-30 : vert (OK)
- 31-60 : orange (à surveiller)
- 61+ : rouge (à risque)

⚠️ Les pondérations sont des hypothèses MVP. À recalibrer après 3 mois d'usage réel.

## 8. Dépendances inter-modules

### Ce que le CRM **fournit** aux autres modules

| Module consommateur | Donnée fournie |
|---|---|
| Doc | Liste clients actifs, alias, identifiants externes (pour rattachement) |
| Calendar | Échéances par client, contacts pour relance, langue |
| Facture | Identité client (fournisseur déjà connu ?), catégorie attendue |
| Salaire | Liste clients service salaire, date validation, contact RH |
| Search | Métadonnées client pour filtrer résultats |

### Ce que le CRM **reçoit** des autres modules

| Module producteur | Donnée reçue |
|---|---|
| Doc | Document classé → maj checklist, dernière activité |
| Facture | Anomalie détectée → maj risque, événement historique |
| Calendar | Relance envoyée / sans réponse → maj historique, risque |
| Salaire | Validation reçue / manquante → maj salaire, risque |

## 9. UX clés et microcopy

- **Vue par défaut** : clients à risque + échéances proches en haut, pas par ordre alphabétique
- **Statut visible** sur chaque ligne avec pastille colorée
- **Explication du score** : au survol du score, afficher les facteurs qui le composent ("3 documents en retard, 1 échéance dépassée")
- **Changements de service** : confirmation explicite ("Désactiver le service salaire ? Les 12 prochaines échéances seront supprimées.")
- **Mode édition vs lecture** : par défaut lecture, bouton "Modifier" explicite. Évite les modifications accidentelles.

## 10. Liste exhaustive des données à stocker

> Voir [`/docs/data-model/crm-schema.md`](../data-model/crm-schema.md) pour le schéma technique complet (types, contraintes, relations).

Récapitulatif des grandes catégories :

1. **Identité** : type, raison sociale, IDE, TVA, adresses, contacts, langue, canal
2. **Relation** : statut, responsable, dates, mandat, tarification, notes
3. **Services actifs** : 6 services booléens + paramètres par service
4. **Paramètres comptables** : fréquence, logiciel, plan, banques, bouclement
5. **Documents attendus** : type, fréquence, deadline, statut, dernière réception
6. **Salaires** : employés, fréquence, contact RH, documents nécessaires, historique
7. **Échéances** : fiscales, TVA, bouclement, salaires, relances, historique
8. **Risque** : score, facteurs, drapeaux, dernière activité
9. **Historique** : événements datés (documents, communications, modifications)
10. **Notes** : libres, datées, par auteur

## 11. Métriques de succès

À mesurer après MVP :

- **Taux de fiches complètes** : % de clients avec toutes les sections renseignées
- **Temps moyen création client** : objectif < 5 min
- **Taux d'utilisation des filtres rapides** : indicateur d'adoption du dashboard
- **Précision du score de risque** : corrélation avec les "vrais" problèmes identifiés par les collaborateurs
- **Fréquence consultation fiche par collaborateur** : indicateur de centralité du CRM

## 12. Hors-scope (à ne pas faire au MVP)

- Portail client (Phase 3)
- Facturation des prestations du cabinet à ses clients (≠ traitement des factures fournisseurs)
- Suivi commercial avancé (pipeline, opportunités) — un statut prospect simple suffit
- Intégration directe Bexio/Abacus côté CRM (réservé au module Facture)
- Multi-utilisateurs avec rôles fins (Phase 2)
- Workflows BPM personnalisables (Phase 3)

## 13. Questions ouvertes spécifiques au CRM

- [ ] Mandat : juste un fichier PDF lié, ou structure de données (objet, durée, honoraires, services) ?
- [ ] Historique : événements typés (event sourcing) ou journal libre ?
- [ ] Catégorisation client : libre (tags) ou taxonomie fermée ?
- [ ] Champs personnalisables par cabinet (Phase 2) ou schéma fixe ?
- [ ] Import initial : comment migrer un cabinet depuis son outil actuel (Excel, Bexio CRM, etc.) ?
- [ ] Suppression RGPD/nLPD : hard delete ou soft delete avec anonymisation ?
