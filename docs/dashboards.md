---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
type: foundation
depends_on: [vision, personas, ux-principles, dashboard-client]
referenced_by: [crm, doc, calendar, dashboard-client]
---

# Dashboards ZARYA

> Vue d'ensemble des différents dashboards offerts par ZARYA selon le rôle utilisateur. Ce document décrit l'**architecture des écrans d'accueil et de pilotage**, pas la spec détaillée de chaque module.

## 1. Vue d'ensemble

ZARYA expose **3 dashboards distincts** selon le rôle :

| Dashboard | Cible | Optimisé pour | Doc dédiée |
|---|---|---|---|
| **Dashboard fiduciaire** | Sophie (responsable cabinet) | Desktop, pilotage global | Ce document |
| **Dashboard collaborateur** | Marc, Julie (membres cabinet) | Desktop, productivité quotidienne | Ce document |
| **Dashboard client** | Patrick, Aïcha (contact RH PME) | Mobile, action ponctuelle | [`dashboard-client.md`](./modules/dashboard-client.md) |

Plus un **dashboard admin ZARYA** (interne, équipe ZARYA), non couvert dans ce document.

Tous les dashboards appliquent les principes de [`ux-principles.md`](./ux-principles.md) avec quelques spécificités par rôle.

---

## 2. Dashboard fiduciaire (Sophie)

### 2.1 Objectif
Donner au responsable cabinet **une vision en temps réel de l'état du cabinet** : où sont les risques, les retards, les nouveaux clients, les opportunités.

### 2.2 Audience et fréquence d'usage
- **Cible primaire** : Sophie (1-3 fois par jour, sessions courtes 5-15 min)
- **Cible secondaire** : associés et responsables d'équipe
- **Contexte** : ouverte en début de matinée, consultée entre rendez-vous

### 2.3 Layout

```
┌────────────────────────────────────────────────────────────┐
│ [Logo cabinet]    [Recherche]    [👤 Sophie]               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Bonjour Sophie, voici l'état de votre cabinet ce matin    │
│                                                            │
│ ┌──────────────────┬──────────────────┬──────────────────┐│
│ │ ⚠️ 3 clients en  │ 📅 12 échéances  │ 💰 45 factures   ││
│ │    retard        │    cette semaine │    à valider     ││
│ │    [Voir]        │    [Voir]        │    [Valider]     ││
│ └──────────────────┴──────────────────┴──────────────────┘│
│                                                            │
│ Top risques                                                │
│ ┌────────────────────────────────────────────────────────┐│
│ │ 🔴 Dupont SA      Risque ↑      3 docs manquants    →││
│ │ 🟠 Martin SARL    Risque ↑      Bouclement bloqué   →││
│ │ 🟡 Tech Sàrl      Risque →      Validation salaire  →││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
│ Pulse cabinet                                              │
│ ┌────────────────────────────────────────────────────────┐│
│ │ Documents reçus aujourd'hui    : 47                    ││
│ │ Documents validés              : 38                    ││
│ │ Factures extraites             : 12                    ││
│ │ Échéances traitées             : 8                     ││
│ │ Relances envoyées              : 15                    ││
│ └────────────────────────────────────────────────────────┘│
│                                                            │
│ [📊 Voir le détail mensuel]                                │
└────────────────────────────────────────────────────────────┘
```

### 2.4 Sections détaillées

**Section 1 — Actions prioritaires (top de l'écran)**
3 cartes compactes :
- Clients en retard (rouge)
- Échéances cette semaine (jaune si > 5)
- Factures à valider (info)

Chaque carte = clic vers la vue détaillée.

**Section 2 — Top risques**
Top 5 des clients avec le score de risque le plus élevé (`crm.risque.score`).
Indicateur de tendance (↑ ↓ →) sur 30 jours.
Clic → fiche client complète.

**Section 3 — Pulse cabinet**
Métriques opérationnelles du jour :
- Documents reçus / validés / classés
- Factures extraites
- Échéances traitées
- Relances envoyées

Permet à Sophie de "sentir" le rythme du cabinet.

**Section 4 — Mensuel (lien)**
Lien vers une vue mensuelle plus complète avec graphiques et tendances.

### 2.5 Personnalisation
- Sophie peut épingler des clients prioritaires
- Filtres : par responsable, par service, par canton
- Vue par équipe si délégation de management

### 2.6 Adapté Marc et Julie (rôles secondaires)
Pour les **gestionnaires** (Marc) :
- Mise en avant des échéances salariales du mois
- Volumétrie : nombre d'employés gérés, validations en cours
- Top 3 clients problématiques sur le périmètre salaire

Pour les **collaborateurs** (Julie) :
- Action prioritaire : Inbox doc (volume à classer)
- Factures à valider (extraction)
- Relances à envoyer (validation des brouillons)

Chaque rôle voit **son périmètre opérationnel**, pas une vue d'ensemble du cabinet.

---

## 3. Dashboard collaborateur opérationnel

### 3.1 Objectif
Donner aux membres du cabinet une **inbox d'actions à faire**, priorisée et claire. C'est la vue principale du travail quotidien.

### 3.2 Structure type (pour Julie)

```
┌────────────────────────────────────────────────────────────┐
│ Inbox de Julie                            🔔 23 actions    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ 🔥 À faire en priorité (5)                                 │
│ ├ Valider classement : facture Swisscom Dupont SA          │
│ ├ Valider salaire : Tech Sàrl, 12 employés                 │
│ ├ Brouillon relance : Martin SARL, document manquant       │
│ ├ Anomalie détectée : IBAN changé fournisseur ABC          │
│ └ Document à classer : 5 pour Garage Romand                │
│                                                            │
│ 📥 Inbox documentaire (38 à valider)                       │
│ [Filtres : Client ▼  Type ▼  Confiance ▼]                  │
│ ├ Doc 1 : Facture Swisscom — 95% — Dupont SA               │
│ ├ Doc 2 : Relevé bancaire UBS — 92% — Martin SARL          │
│ └ ... [Voir tout →]                                        │
│                                                            │
│ 💰 Factures à valider (12)                                 │
│ ├ Facture 1 : Migros — 245 CHF                             │
│ └ ... [Voir tout →]                                        │
│                                                            │
│ 📅 Relances à envoyer (8 brouillons)                       │
│ └ ... [Voir tout →]                                        │
│                                                            │
│ ✅ Traité aujourd'hui : 47 actions                         │
└────────────────────────────────────────────────────────────┘
```

### 3.3 Comportement
- Cliquer sur une action → drawer ou page dédiée
- Validation 1-clic possible depuis le dashboard pour les cas évidents
- Auto-refresh toutes les 30 secondes pour les changements collègues
- Compteur en haut visible depuis n'importe où

### 3.4 Filtres et tris
- Par type d'action
- Par client (épinglés en premier)
- Par urgence (anomalies, retards en premier)
- Par confiance IA (basse en premier = à examiner)

### 3.5 Mode focus
Bouton "Focus mode" : masque les notifications, plein écran, raccourcis clavier.

---

## 4. Dashboard client (Patrick / Aïcha)

> Spec détaillée dans [`/docs/modules/dashboard-client.md`](./modules/dashboard-client.md). Résumé ici pour cohérence.

### 4.1 Objectif
Permettre au contact RH du client de **réaliser l'action attendue par son cabinet** en moins de 5 minutes, depuis son téléphone.

### 4.2 Layout mobile-first

```
┌─────────────────────┐
│ [Logo cabinet]      │
│                     │
│ Bonjour Aïcha,      │
│                     │
│ Vous avez 1 action  │
│ à faire :           │
│                     │
│ ┌─────────────────┐ │
│ │ Valider salaires│ │
│ │   d'avril       │ │
│ │                 │ │
│ │ Avant le 25/04  │ │
│ │                 │ │
│ │ [Commencer]     │ │
│ └─────────────────┘ │
│                     │
│ Documents récents   │
│ ├ Décompte AVS Q1   │
│ ├ Bulletin mars     │
│ └ ...               │
│                     │
│ [📞 Contacter cabinet]│
└─────────────────────┘
```

### 4.3 Principe central
**Une action prioritaire à la fois**. Si rien n'est attendu, l'écran affiche "Tout est à jour, prochaine échéance le X".

### 4.4 Branding cabinet
- Logo et couleurs du cabinet (pas ZARYA)
- Le contact RH ressent qu'il est "chez son cabinet"

### 4.5 Mode multi-clients
Pour un comptable freelance qui gère plusieurs PME : sélecteur en haut, vue agrégée des actions à faire sur tous ses dossiers.

---

## 5. Dashboard admin ZARYA (interne)

### 5.1 Cible
Équipe ZARYA (Tristan + futurs employés) pour superviser la plateforme.

### 5.2 Sections
1. **Monitoring cabinets** : nombre actifs, derniers actifs, en risque de churn
2. **Métriques business** : MRR, churn, NPS, conversion essai → payant
3. **Monitoring technique** : latences, erreurs, coûts LLM par cabinet
4. **Support** : tickets ouverts, temps de réponse moyen
5. **Onboarding pipeline** : cabinets en cours d'onboarding, retards

### 5.3 Restrictions
- **Pas d'accès aux données métier** des cabinets (RLS active)
- Lecture seule des données techniques
- Audit strict : chaque accès loggué
- Sous-traitants : impossible d'accéder à la prod sans review

---

## 6. Patterns communs aux dashboards

### 6.1 Carte d'action
Pattern UI réutilisé partout :
```
┌──────────────────┐
│ [Icône] Titre    │
│                  │
│ Description      │
│                  │
│ [Action prim.]   │
└──────────────────┘
```

### 6.2 Liste compacte avec actions
```
[Item 1]  [statut]  [→]
[Item 2]  [statut]  [→]
[Item 3]  [statut]  [→]
[Voir tout →]
```

### 6.3 Métriques inline
```
Métrique : valeur (tendance)
```
Pas de gros KPIs colorés. Densité raisonnable.

### 6.4 Section "Aujourd'hui" récurrente
Compteurs de l'activité du jour pour donner un feedback positif.

### 6.5 Navigation latérale ou en bas
- Desktop : sidebar gauche (Inbox / Documents / CRM / Calendrier / Search / Facture / Salaire)
- Mobile : bottom tab (4-5 sections max)

## 7. Différences entre dashboards

| Aspect | Fiduciaire (Sophie) | Collaborateur | Client |
|---|---|---|---|
| **Densité** | Haute (vue d'ensemble) | Haute (productivité) | Basse (action unique) |
| **Device** | Desktop | Desktop | Mobile (90%) |
| **Fréquence** | 1-3x/jour | Toute la journée | 1-2x/mois |
| **Durée session** | 5-15 min | 4-8h cumulées | 2-5 min |
| **Branding** | ZARYA + cabinet | ZARYA + cabinet | 100% cabinet |
| **Vocabulaire** | Métier fiduciaire | Métier fiduciaire | PME, sans jargon |
| **Personnalisation** | Forte (épinglages) | Forte (filtres) | Minimale |
| **Pilotage** | Risques, tendances | Tâches à faire | Action prioritaire |

## 8. Évolutions prévues

### 8.1 Phase 2
- **Personnalisation avancée** : drag & drop des widgets pour Sophie
- **Notifications push** mobile sur dashboard client
- **Mode lecture seule** pour les associés non-utilisateurs quotidiens
- **Comparaisons inter-périodes** : ce mois vs le mois dernier

### 8.2 Phase 3
- **Prédictions IA** : "Risque que Dupont SA soit en retard sur la TVA Q2 : 80%"
- **Recommandations proactives** : "5 clients pourraient bénéficier de votre nouveau service X"
- **Dashboards thématiques** : par canton, par secteur d'activité
- **Co-pilotage IA** : assistant conversationnel intégré dans le dashboard

### 8.3 Phase 4
- **Dashboard cabinet-cabinet** : pour les groupements de fiduciaires partageant des données
- **Dashboards rôles spécialisés** : audit, conseil, expertise

## 9. Métriques de succès des dashboards

### 9.1 Dashboard fiduciaire
- Sophie ouvre le dashboard en moyenne 3x/jour
- Temps moyen sur le dashboard < 10 min (signal d'efficacité)
- 80%+ des Sophie consultent le dashboard quotidiennement

### 9.2 Dashboard collaborateur
- Inbox traitée à 80% chaque jour (pas de backlog qui grossit)
- Validation 1-clic > 60% des actions (signal de qualité IA)
- Temps moyen pour traiter une action < 30 sec

### 9.3 Dashboard client
- 70%+ des contacts RH se connectent au moins 1x/mois
- Action principale réalisée en < 5 min
- Taux de réalisation des actions demandées > 80%

## 10. À tester en interview

- Aperçus visuels (wireframes Figma) montrés en interview
- Réactions sur la densité d'info (trop / juste / pas assez)
- Hiérarchie des informations (la bonne info est-elle en premier ?)
- Vocabulaire utilisé (familier vs trop technique vs trop simple)
- Branding cabinet vs ZARYA (le contact RH le remarque-t-il ?)

## 11. Questions ouvertes

- [ ] **Sophie veut-elle voir les KPIs financiers du cabinet** (CA, marge) ou se contente-t-elle des KPIs opérationnels ?
- [ ] **Doit-on afficher la productivité par collaborateur** au responsable ? (risque de micromanagement)
- [ ] **Le dashboard collaborateur doit-il fusionner avec l'inbox** (un seul écran) ou rester distinct ?
- [ ] **Notifications proactives** : push mobile dès le MVP ou Phase 2 ?
- [ ] **Mode "Aujourd'hui" vs "Cette semaine"** : par défaut quelle vue temporelle ?
- [ ] **Vue agrégée multi-clients** côté client final : utile vraiment ?
- [ ] **Personnalisation** : drag & drop des widgets ou layout fixe MVP ?
- [ ] **Compteur de feedback** ("47 actions traitées aujourd'hui") : motivant ou stressant ?
