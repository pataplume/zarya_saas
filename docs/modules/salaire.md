---
status: draft
owner: tristan
last_updated: 2026-05-26
module: salaire
priority: P2
depends_on: [crm, doc, calendar, multi-tenant, onboarding-client, dashboard-client]
referenced_by: [onboarding-client]
---

# Zarya Salaire — Validation mensuelle des salaires

## 1. Rôle dans l'architecture

Zarya Salaire orchestre le **cycle mensuel de validation salariale** entre le cabinet fiduciaire et ses clients PME. Le module ne calcule **pas** les salaires lui-même (Bexio Payroll, Crésus Salaires, WinBIZ, Abacus Lohn font ça). Il gère :

1. La **collecte structurée** des éléments du mois (heures, absences, primes, changements employés) via un **mini-dashboard client**
2. La **pré-population** automatique à partir du mois précédent
3. La **validation** par le client et le contrôle par le gestionnaire fiduciaire
4. L'**export structuré** vers le logiciel de paie cible (CSV/Excel/format propriétaire)
5. La **traçabilité** complète du cycle pour audit

Le module est **activé conditionnellement** : visible uniquement pour les clients dont le service `salaires` est actif dans le CRM.

## 2. Évolution du périmètre

Le module a une **stratégie produit v1 → v2 → v3** :

| Version | Périmètre | Statut |
|---|---|---|
| **v1 (MVP)** | Workflow + dashboard client + export vers logiciels de paie | **À construire** |
| v2 | ZARYA devient transmetteur Swissdec (ELM en mode EIV), sans calcul | Phase 2-3 |
| v3 | Calcul de paie complet, certification Swissdec | Hors-scope produit actuel |

Voir [`docs/roadmap.md`](../roadmap.md) pour le détail.

## 3. Objectif utilisateur

**Côté fiduciaire (gestionnaire salaires)** :
- Lancer le cycle mensuel pour tous ses clients en quelques clics
- Voir en temps réel qui a validé / pas validé
- Compléter à la place du client si besoin
- Générer un export propre vers son logiciel de paie

**Côté client final (contact RH)** :
- Recevoir une notification "vos salaires de mai sont à valider"
- Se connecter, voir les employés et éléments du mois pré-remplis depuis avril
- Ajuster ce qui change ce mois (heures, absences, primes, entrées/sorties)
- Valider en quelques minutes

## 4. Personas concernés

| Persona | Rôle dans Salaire | Interface |
|---|---|---|
| Gestionnaire salaires | Pilote le cycle, contrôle, exporte | Dashboard fiduciaire complet |
| Responsable fiduciaire | Vue agrégée, KPIs risque | Dashboard global ZARYA |
| Collaborateur comptable | Lecture seule | Dashboard fiduciaire (read-only) |
| Contact RH client | Saisit et valide les données mensuelles | Mini-dashboard client |
| Dirigeant client | Peut valider à la place du RH | Mini-dashboard client (même rôle) |

## 5. Cycle mensuel type

```
J-10  →  Création automatique de la période M
         + Copie des éléments récurrents de M-1
         + Application des changements actés en M-1
         + Notification email au contact RH client (avec lien)

J-8   →  Client se connecte au mini-dashboard
         → Voit la liste employés + éléments pré-remplis
         → Ajuste / complète / valide
         OU
         Gestionnaire fiduciaire saisit pour le client si besoin

J-5   →  Premiers retours, gestionnaire suit le dashboard

J-3   →  Relance auto des clients silencieux (avec validation humaine)

J-1   →  Alerte rouge sur les non-validés

J     →  Date limite de validation
         Gestionnaire génère les exports pour les clients validés

J+1   →  Import des données dans les logiciels de paie (Bexio, Crésus...)
         Calcul et génération des bulletins (hors ZARYA)

J+3   →  Clôture des périodes ZARYA, devient référence pour M+1
```

`J` = `crm.salaire_config.date_validation_jour_du_mois`.

## 6. Interface fiduciaire — Écrans

### 6.1 Dashboard Salaire (vue gestionnaire)
**KPIs en haut** :
- Clients à valider ce mois (total)
- Validations reçues (count + %)
- En attente client (count)
- En retard (count, rouge)
- Changements employés déclarés (count)
- Exports générés / restants

**Tableau central** : 1 ligne par client (services.salaires = actif).

| Colonne | Contenu |
|---|---|
| Client | Raison sociale + lien fiche CRM |
| Période | Mois courant |
| Statut | `non_demandee`, `en_attente`, `relancee`, `validee`, `en_retard`, `exporte`, `cloturee` |
| Dernière action | Qui (client / fiduciaire) a édité en dernier |
| Pièces structurées | Heures, absences, primes, changements (counts) |
| Pièces jointes | Documents bruts uploadés par le client |
| Logiciel cible | Bexio / Crésus / WinBIZ / Excel |
| Export | Pastille : non généré / généré / téléchargé / importé confirmé |
| Actions | Voir détail, saisir pour client, relancer, exporter, marquer importé |

**Filtres** : en retard, sans réponse, avec changements, prêts à exporter, exportés non confirmés.

### 6.2 Détail période client (vue gestionnaire)
Même UI que côté client, **plus** :
- Bandeau "vous éditez à la place du client" si le gestionnaire saisit
- Historique des modifications (qui, quand, quoi)
- Section "Export" avec choix du format et bouton de génération
- Section "Notes internes" invisible au client

### 6.3 Lancement campagne mensuelle
Wizard :
1. Sélection période (mois cible, par défaut M en cours)
2. Sélection clients (tous cochés par défaut, possibilité d'exclure)
3. Aperçu emails de notification (langue/template)
4. Validation et envoi groupé
5. Création des `salaire.periode` + pré-remplissage automatique depuis M-1

### 6.4 Vue annuelle / historique
Matrice clients × mois pour l'année courante, statut par cellule. Utile pour :
- Audit (visualiser tous les retards)
- Détecter les clients problématiques récurrents
- Préparer fin d'année (certificats salaire, déclarations Swissdec ELM annuelles)

## 7. Interface client — Mini-dashboard

### 7.1 Authentification
- **Compte avec mot de passe** par contact RH client
- Création du compte par la fiduciaire (envoi email avec lien d'activation)
- Mot de passe défini par le contact RH lui-même à la 1re connexion
- 2FA recommandée mais non obligatoire au MVP
- Reset de mot de passe par email

### 7.2 Périmètre de visibilité
Un contact RH voit **uniquement les données de son entreprise**. Pas d'accès aux autres clients du cabinet.

Plusieurs contacts RH possibles par client (ex. RH + assistant RH). Tous voient les mêmes données, peuvent éditer.

### 7.3 Écran "Accueil"
À la connexion :
- Salutation + nom de l'entreprise
- Période en cours à valider (carte mise en évidence)
- Statut : "à compléter" / "en attente de validation" / "validée" / "en retard"
- Bouton principal : "Compléter la période de [mois]"
- Liste des périodes passées (lecture seule après clôture)
- Coordonnées du gestionnaire fiduciaire (nom, email, téléphone)

### 7.4 Écran "Compléter la période"
Vue par défaut : **tableau employés × éléments**.

**Tête de colonne** :
- Employé (nom)
- Salaire de base (info, non éditable ici)
- Heures travaillées (si applicable)
- Heures supplémentaires
- Absences (jours)
- Primes / bonus
- Indemnités (km, repas, etc.)
- Notes

**Pré-rempli automatiquement** depuis M-1 pour les éléments récurrents (salaire base, indemnités fixes). Le client n'ajuste que les variables.

**Boutons d'action** :
- "Ajouter un employé" → wizard de déclaration d'entrée
- "Marquer un départ" → sur la ligne employé
- "Aucun changement ce mois, je valide" → bouton rapide
- "Valider la période" → bouton principal en bas

### 7.5 Écran "Déclarer un changement"
Modale spécifique pour les changements significatifs :
- Type : entrée, sortie, augmentation, changement taux activité, congé non payé, maternité/paternité, accident/maladie longue, autre
- Employé concerné (sélection ou création)
- Date d'effet
- Montant impact (si applicable)
- Description libre
- Pièce jointe (contrat, certificat médical, etc.)

### 7.6 Pièces jointes libres
En complément des données structurées, le client peut joindre des fichiers :
- Décompte d'heures détaillé (Excel/PDF)
- Note de frais
- Justificatifs
- Autre

Ces pièces sont stockées dans Doc et rattachées à la période.

### 7.7 Notifications email au client
- **Création de période** : "Vos salaires de [mois] sont à valider d'ici le [date]"
- **Relance J-3** : "Rappel : il vous reste 3 jours pour valider"
- **Confirmation validation** : "Merci, vos données ont été validées"
- **Modification fiduciaire** : "[Nom gestionnaire] a complété votre période de [mois]"

## 8. Mode "édition partagée"

**Règle adoptée** : les deux parties peuvent éditer librement, le dernier qui sauvegarde l'emporte.

**Garde-fous UX** :
- Affichage visible "Dernière modification par [Nom] (côté [client/fiduciaire]) le [date]"
- Verrouillage automatique après statut `validee` → édition possible uniquement par déverrouillage manuel (action gestionnaire)
- Verrouillage strict après statut `exporte` → réouverture explicite avec motif
- Verrouillage strict après statut `cloturee`

**Pas de "édition concurrente en temps réel"** au MVP (pas de Y.js / CRDT). Si deux personnes éditent en même temps, on charge à l'ouverture, on sauvegarde à la validation, et on indique "Les données ont été modifiées depuis votre ouverture, recharger ?" si conflit détecté.

## 9. Référentiel employés (modèle hybride)

**Source de vérité légale** : le logiciel de paie du cabinet (Bexio, Crésus, etc.). C'est lui qui détient les contrats, salaires de base officiels, données AVS, etc.

**Source opérationnelle ZARYA** : table `salaire.employe`, alimentée par :
1. Import initial (Excel/CSV) lors de l'activation du module pour un client
2. Mise à jour à chaque changement déclaré (entrée, sortie, modification)
3. Re-synchronisation manuelle si divergence détectée

**ZARYA propose**, le logiciel de paie **dispose**. Concrètement :
- Quand un client déclare une entrée, ZARYA ajoute l'employé dans `salaire.employe` avec statut "à confirmer"
- Le gestionnaire fiduciaire l'importe dans Bexio/Crésus, puis confirme dans ZARYA
- Si un employé existe dans Bexio mais pas dans ZARYA → import manuel ou via fichier
- Pas de synchronisation automatique au MVP (trop complexe, formats hétérogènes)

**Statuts employé** :
- `propose` : déclaré par client, pas encore confirmé côté paie
- `actif` : confirmé, employé en activité
- `sorti` : départ enregistré
- `archive` : historique conservé mais hors vue par défaut

## 10. Stratégie d'export

**Approche** : structurer les données suffisamment richement pour exporter vers les principaux logiciels suisses, avec un fallback Excel humain pour les cas non couverts.

### 10.1 Logiciels cibles prioritaires (MVP)

| Logiciel | Mode d'export ZARYA | Statut MVP |
|---|---|---|
| **Bexio Payroll** | CSV structuré conforme à l'import variables Bexio | Cible v1 |
| **Crésus Salaires** | CSV / fichier d'import Crésus | Cible v1 |
| **WinBIZ Salaires** | Excel / CSV format WinBIZ | Cible v1 |
| **Abacus Lohn** | Excel générique + Abaconnect en v2 | Phase 2 |
| **Swiss21** | Via API Bexio | Phase 2 |
| **Banana / Excel maison** | Excel humain (cf. §10.3) | MVP fallback |

⚠️ Les formats exacts de chaque logiciel doivent être validés en interview avec un utilisateur réel de chaque outil. Voir [`docs/architecture/payroll-integration.md`](../architecture/payroll-integration.md) (à créer).

### 10.2 Principe technique

- Les **données collectées** dans ZARYA sont structurées de manière universelle (employé, type d'élément, montant, unité, période)
- Les **mappings vers les logiciels cibles** sont définis dans des fichiers de configuration séparés (1 par logiciel × version)
- L'export = transformation + génération de fichier au bon format

Architecture cible : mappings en JSON/YAML versionnés, indépendants du code applicatif. Permet d'ajouter un nouveau logiciel ou nouvelle version sans re-déploiement.

### 10.3 Fallback : export Excel "humain"

Pour les cas où :
- Le logiciel cible n'a pas (encore) de mapping ZARYA
- Le cabinet utilise un outil exotique
- Le cabinet préfère faire du copier-coller manuel

ZARYA génère un **fichier Excel propre** avec :
- 1 onglet "Employés" : liste avec colonnes lisibles (Nom, Prénom, AVS, Salaire base, Taux)
- 1 onglet "Variables du mois" : lignes employé × colonnes types d'éléments (heures sup, primes, indemnités, etc.)
- 1 onglet "Absences" : lignes employé × type × jours × motif
- 1 onglet "Changements" : entrées, sorties, modifications avec dates d'effet
- 1 onglet "Pièces jointes" : liste des fichiers reçus avec lien de téléchargement

Mise en forme : colonnes nommées explicitement, totaux en bas, codes couleur (entrées en vert, sorties en rouge, alertes en orange). Pas de magie : un humain doit pouvoir copier-coller chaque cellule dans son outil de paie.

### 10.4 Suivi post-export

Une fois l'export téléchargé par le gestionnaire :
- Statut `exporte` sur la période
- Bouton "Marquer importé dans [logiciel]" pour traçabilité
- Date et identifiant du gestionnaire qui a confirmé
- Permet de mesurer le KPI "délai entre export et import effectif"

## 11. Actions principales

| Action | Acteur | Effet |
|---|---|---|
| Lancer campagne mensuelle | Gestionnaire | Crée N périodes + pré-remplit + envoie notifications |
| Saisir données (employé × élément) | Client OU gestionnaire | Met à jour `salaire.element_paie` |
| Déclarer changement employé | Client OU gestionnaire | Crée `salaire.changement` + maj `salaire.employe` |
| Joindre pièce | Client OU gestionnaire | Upload fichier, lien Doc |
| Valider période | Client OU gestionnaire | Statut `validee` |
| Déverrouiller période validée | Gestionnaire | Permet ré-édition |
| Générer export | Gestionnaire | Crée `salaire.export` + fichier téléchargeable |
| Marquer importé | Gestionnaire | Confirmation manuelle, log audit |
| Clôturer période | Auto (J+3) ou manuel | Verrouille, devient référence pour M+1 |
| Réouvrir période clôturée | Gestionnaire | Avec motif, log audit |

## 12. États d'une période

```
        ┌─────────────────┐
        │  non_demandee   │  (créée auto, mais notification pas encore envoyée)
        └────────┬────────┘
                 │ notification envoyée
                 ▼
        ┌─────────────────┐
        │   en_attente    │  (client doit compléter et valider)
        └────────┬────────┘
                 │ J-3 sans action
                 ▼
        ┌─────────────────┐
        │    relancee     │  (relance envoyée)
        └────────┬────────┘
         ┌───────┴────────┐
         │                │
   validée          deadline dépassée
         │                │
         ▼                ▼
   ┌──────────┐    ┌──────────┐
   │ validee  │    │ en_retard│
   └────┬─────┘    └────┬─────┘
        │               │
        │ export généré │
        ▼               │
   ┌──────────┐         │
   │ exportee │         │
   └────┬─────┘         │
        │               │
        └───────┬───────┘
                │ J+3
                ▼
        ┌─────────────────┐
        │     cloturee    │  (verrouillée définitivement)
        └─────────────────┘
```

État spécial : `non_applicable` (client en pause).

## 13. Dépendances inter-modules

### Ce que Salaire **lit** du CRM
| Donnée | Usage |
|---|---|
| `crm.client` | Filtrer clients actifs, langue |
| `crm.service` (type=salaires) | Quels clients sont concernés |
| `crm.salaire_config` | Paramètres : jour validation, contact RH, logiciel cible, pièces attendues |
| `crm.contact` (est_contact_rh) | Destinataires notifications + comptes mini-dashboard |
| `crm.modele_email_relance` | Templates |

### Ce que Salaire **écrit** vers le CRM
| Donnée | Trigger |
|---|---|
| `crm.evenement` | Sur chaque action significative |
| `crm.risque` | Si validation en retard ou non reçue |
| `crm.client.derniere_activite` | À chaque interaction |

### Interaction avec Doc
- Pièces jointes uploadées par le client via mini-dashboard → stockées dans Doc, rattachées à la période
- Si un client envoie un email avec PJ au lieu du portail, Doc le détecte et rattache automatiquement (fallback gracieux)

### Interaction avec Calendar
- Calendar affiche les deadlines salaire à venir en lecture seule
- Mais c'est Salaire qui gère son propre cycle (trop fréquent et spécifique pour Calendar)

## 14. UX clés

- **Pré-remplissage intelligent** : le client ne saisit que les changements, pas tout le mois à zéro
- **Bouton "rien à signaler"** : action 1-clic si aucun changement
- **Indication visuelle** côté gestionnaire : ce que le client a modifié vs ce que la fiduciaire a complété
- **Notifications maîtrisées** : pas de spam (au plus 1 notification + 1 relance par cycle)
- **Mobile-first sur le mini-dashboard** : beaucoup de RH PME consultent sur téléphone
- **Microcopy clair** : pas de jargon comptable côté client ("indemnités forfaitaires" → "remboursement km/repas")
- **Pas de friction sur l'authentification** : login simple, "rester connecté" coché par défaut

## 15. Données stockées

Voir [`docs/data-model/salaire-schema.md`](../data-model/salaire-schema.md) pour le schéma technique complet.

Grandes catégories :
1. **Référentiel employés** (`salaire.employe`)
2. **Périodes mensuelles** (`salaire.periode`)
3. **Éléments de paie structurés** (`salaire.element_paie`) — 1 ligne = 1 employé × 1 période × 1 type
4. **Absences** (`salaire.absence`)
5. **Changements déclarés** (`salaire.changement`)
6. **Pièces jointes libres** (`salaire.piece`)
7. **Notifications et relances** (`salaire.notification`, `salaire.relance`)
8. **Validations** (`salaire.validation`)
9. **Exports** (`salaire.export`)
10. **Comptes d'accès clients** (`salaire.acces_client`)
11. **Configuration mappings export** (`salaire.format_export`, `salaire.mapping_export`)
12. **Catalogue d'éléments** (`salaire.type_element_paie`)
13. **Événements** (`salaire.evenement`)

## 16. Sécurité et confidentialité

- **Authentification clients** : Supabase Auth, mots de passe hashés (bcrypt), reset par email signé
- **RLS Postgres** : chaque contact RH voit uniquement les données de son `client_id`
- **Audit log** : toute action (lecture sensible, modification, validation, export) logguée dans `salaire.evenement`
- **Chiffrement at rest** : données salariales nominatives bénéficient du chiffrement Supabase standard
- **2FA optionnelle** au MVP (recommandée fortement v2)
- **Sessions limitées** : déconnexion auto après 24h d'inactivité
- **Données sensibles** (AVS, salaire base) : visibles côté client mais journalisées à chaque consultation

## 17. Métriques de succès

- **Taux d'adoption du mini-dashboard** : % de contacts RH qui se connectent au moins 1×/mois
- **Taux de validation à J** : % de clients qui valident avant deadline
- **Délai moyen de validation** : entre notification et validation
- **Taux de relances nécessaires** : % de périodes nécessitant 1+ relance
- **Taux d'export réussi** : % d'exports importés sans correction manuelle
- **Temps gestionnaire par cycle mensuel** : objectif < 2h pour 50 clients
- **NPS contacts RH clients** : satisfaction utilisateurs finaux

## 18. Hors-scope MVP

- Calcul effectif des salaires (Phase 3+)
- Génération des bulletins de paie
- Déclarations Swissdec ELM annuelles auto-générées (Phase 2)
- Module KLE (sinistres maladie/accident) (Phase 3+)
- Module EO (cas de service militaire/maternité) (Phase 3+)
- Connecteurs natifs API logiciels paie (CSV/Excel au MVP, API en Phase 2)
- Portail employé final (les employés ne sont pas utilisateurs)
- Synchronisation bidirectionnelle avec logiciel de paie
- Édition concurrente temps réel (Y.js/CRDT)
- 2FA obligatoire (recommandée mais pas imposée au MVP)

## 19. Questions ouvertes spécifiques

- [ ] Politique de stockage des AVS et coordonnées bancaires : chiffrement applicatif additionnel ?
- [ ] Notification email vs SMS : SMS utile pour les contacts RH peu réactifs ?
- [ ] Niveau de personnalisation des éléments paie par cabinet (catalogue fixe vs configurable) ?
- [ ] Import initial des employés : Excel/CSV libre, ou template imposé par ZARYA ?
- [ ] Format Crésus : .csv ? .crp ? À valider en interview
- [ ] Bexio Payroll : API REST en MVP ou seulement export CSV ?
- [ ] Gestion des contrats : on stocke le contrat de travail (PDF) ou juste les paramètres salariaux ?
- [ ] Multi-établissement : un client avec 2 raisons sociales = 2 périodes parallèles ?
- [ ] Que faire si le client ne se connecte JAMAIS au dashboard ? Fallback email permanent ?
- [ ] Délai légal de conservation des données salariales : 10 ans CO ? À confirmer pour ZARYA en tant que sous-traitant

---

## 20. Lien avec l'Onboarding

Le module Salaire s'appuie sur l'**onboarding client initial** réalisé par le client. Voir [`/docs/modules/onboarding-client.md`](./onboarding-client.md) pour la spec complète.

**Règle invariante** : aucune période mensuelle ne peut être créée tant que l'onboarding n'est pas en statut `terminee`. Le référentiel `salaire.employe` doit contenir tous les employés actifs validés.

**Réutilisation des écrans onboarding** :
- Les **cartes employé avec validation IA** sont réutilisées en cours d'année pour les vagues d'embauches (sans le caractère bloquant)
- Le **pipeline d'extraction** sert aussi pour parser les pièces jointes mensuelles (décompte heures, etc.)

