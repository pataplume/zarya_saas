---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: onboarding-client
depends_on: [crm, salaire, doc, multi-tenant, extraction-ia, dashboard-client]
referenced_by: [salaire, dashboard-client]
---

# Zarya — Onboarding client assisté IA

## 1. Rôle dans le produit

L'**onboarding client** est la **première interaction** d'un nouveau client (PME, indépendant, association) avec ZARYA. Il intervient une fois que la fiduciaire a créé le compte du client dans son cabinet et que ce dernier reçoit son mail d'activation.

**Distinction importante** : à ne pas confondre avec l'**onboarding fiduciaire** (souscription du cabinet à ZARYA), documenté dans [`onboarding-fiduciaire.md`](./onboarding-fiduciaire.md). L'onboarding fiduciaire intervient **une seule fois** quand un cabinet s'inscrit. L'onboarding client se rejoue **pour chaque client** que le cabinet ajoute.

**Promesse produit** : transformer la corvée d'onboarding (saisir les infos d'entreprise + 30 employés à la main avec leurs contrats, AVS, IBAN, etc.) en un workflow Zefix + upload IA → validation 1-clic.

**Triple usage** :
1. Création initiale du client dans le système (identité via Zefix, services, paramètres)
2. Création initiale du référentiel employés (`salaire.employe`) si service salaire activé
3. Réutilisation en cours d'année pour les **vagues d'embauches** (mêmes écrans, même flow, sans le caractère bloquant)

**Multi-tenant** : toute l'onboarding crée des ressources scopées par le `cabinet_id` du cabinet qui héberge le client. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Principe directeur

L'onboarding est **bloquant strict** : aucun autre workflow (création de période mensuelle, génération d'export, etc.) n'est possible tant que l'onboarding n'est pas terminé à 100%.

Tous les champs Swissdec-ready de tous les employés actifs doivent être renseignés et validés.

Cette rigueur est volontaire :
- Évite les périodes mensuelles avec employés incomplets
- Force la qualité dès le départ
- Permet d'exporter vers Bexio/Crésus dès le 1er mois sans correctifs

## 3. Acteurs

| Acteur | Rôle | Interface |
|---|---|---|
| Client final (dirigeant ou contact RH) | Réalise l'onboarding seul ou avec aide | Dashboard client |
| Gestionnaire fiduciaire | Peut compléter à la place du client (édition partagée) | Dashboard fiduciaire (même UI ou impersonation) |
| Système ZARYA (LLM) | Extrait et propose les données | Pipeline asynchrone |

## 4. Structure en 3 étapes

```
ÉTAPE 1 — Identification entreprise (5-10 min)
   Recherche Zefix par IDE ou nom
   → Auto-remplissage identité, adresse, organes
   → Le client valide ou ajuste
   → Création crm.client + crm.adresse

ÉTAPE 2 — Configuration services et paramètres (5-10 min)
   Sélection des services souscrits (compta, fiscalité, salaires, TVA...)
   Paramètres comptables (logiciel actuel, plan, bouclement)
   Documents attendus (via modèle de checklist par type)
   → Création crm.service + crm.param_comptable + crm.document_attendu

ÉTAPE 3 — Onboarding Salaire (15-60 min selon nb employés)
   Si service salaires non actif → étape skipée
   
   3a. Configuration générale paie
       Caisses AVS/LPP/accidents, jour validation, logiciel cible
       → Création/maj crm.salaire_config
   
   3b. Référentiel employés
       Option A : Upload fichier (Excel/CSV/PDF)
                  → Extraction LLM universelle
                  → Propositions par employé
                  → Validation granulaire champ par champ
       Option B : Saisie 1 par 1
                  → Formulaire complet par employé
       Option C : Mixte
       → Création salaire.employe (statut actif)
```

À la fin : onboarding terminé, dashboard mensuel récurrent débloqué.

## 5. Étape 1 — Identification entreprise via Zefix

### 5.1 Recherche
- Champ unique : IDE (`CHE-XXX.XXX.XXX`) ou raison sociale ou nom
- Appel API Zefix (clé déjà disponible)
- Résultats affichés en liste si plusieurs matches

### 5.2 Consentement nLPD
Avant l'appel Zefix, checkbox affichée (cochée par défaut) :
> *"J'autorise ZARYA à récupérer les informations publiques de mon entreprise depuis le registre du commerce suisse (Zefix)."*

Pas d'appel sans consentement explicite. Log de l'événement dans `crm.evenement`.

### 5.3 Auto-remplissage
Champs récupérés depuis Zefix :
- Raison sociale
- Forme juridique (SA, Sàrl, raison individuelle, association...)
- Numéro IDE (CHE-)
- Adresse du siège (rue, NPA, ville, canton)
- Date d'inscription
- Capital social
- Organes (administrateurs, signataires) → suggestion de contacts `crm.contact`
- Statut (actif / en liquidation / radié)

### 5.4 Validation utilisateur
Tous les champs récupérés sont **éditables**. Le client peut :
- Corriger une info erronée
- Compléter les champs non disponibles via Zefix (numéro TVA, langue, canal préféré)
- Confirmer les contacts proposés depuis les organes

### 5.5 Fallback : saisie manuelle
Si Zefix ne renvoie rien (indépendant non inscrit, association non enregistrée), formulaire libre classique. L'utilisateur saisit tout.

### 5.6 Hors-scope MVP
- Recherche TVA active via ESTV → v2
- Sources alternatives (Moneyhouse, etc.) → v2
- Auto-import de documents légaux (statuts, extrait RC) → v2

## 6. Étape 2 — Configuration services et paramètres

### 6.1 Sélection des services
6 services proposés en cards cliquables (booléens) :
- Comptabilité
- Fiscalité
- Salaires
- TVA
- Bouclement
- Conseil

Chaque service activé déclenche un sous-formulaire :

**Comptabilité** : régime (ordinaire/simplifié), logiciel actuel (Bexio/Abacus/Crésus/WinBIZ/Banana/autre), plan comptable

**TVA** : régime (effectif/taux de la dette fiscale nette), fréquence des décomptes (trimestrielle/semestrielle)

**Salaires** : activation simple ici, configuration détaillée en étape 3

**Bouclement** : date de fin d'exercice

### 6.2 Application du modèle de checklist
Selon le **type de client** (PME / indépendant / association) et les **services activés**, ZARYA propose une checklist de documents attendus par défaut (`crm.modele_checklist`).

Le client peut :
- Voir la liste générée
- Décocher des documents non pertinents
- Ajouter des documents personnalisés
- Définir la fréquence par document si différente du défaut

### 6.3 Données stockées
- `crm.service` : 1 ligne par service activé
- `crm.param_comptable` : 1 ligne (logiciel, plan, bouclement, etc.)
- `crm.document_attendu` : N lignes selon checklist appliquée
- `crm.banque` : optionnel, peut être ajouté ici

## 7. Étape 3 — Onboarding Salaire

### 7.1 Pré-requis
Étape skipée si le service `salaires` n'a pas été activé en étape 2.

### 7.2 Phase 3a — Configuration générale
Formulaire condensé sur 1 écran :

- Nombre d'employés estimé (info, sera affiné après import)
- Logiciel de paie cible (Bexio Payroll, Crésus Salaires, WinBIZ, Abacus Lohn, OfficeMaker Staff, autre, aucun)
- Jour de validation mensuelle (1-31, défaut 20)
- Caisse AVS (sélection ou saisie libre)
- Caisse LPP
- Assurance accidents (LAA obligatoire + LAANP)
- Assurance IJM (optionnelle)
- Contact RH principal (sélection parmi `crm.contact` ou création nouveau)
- Pièces attendues par période (sélection multi : heures, absences, primes, variables, entrées, sorties, frais)

Création/mise à jour de `crm.salaire_config`.

### 7.3 Phase 3b — Constitution du référentiel employés

**Trois modes au choix** :

#### Mode A — Upload fichier
- Drag & drop ou sélection (Excel, CSV, PDF, PNG/JPG)
- Multiples fichiers autorisés
- Catégories optionnelles : "Liste employés", "Contrats", "Attestations AVS", "Mixte"
- Bouton "Lancer l'extraction IA"

#### Mode B — Saisie manuelle
- Bouton "Ajouter un employé"
- Formulaire complet (tous les champs Swissdec-ready)
- Répété N fois

#### Mode C — Mixte
- Upload partiel + ajout manuel des employés manquants
- Possibilité de relancer un upload à tout moment

### 7.4 Pipeline d'extraction LLM

Pour chaque fichier uploadé :

```
1. Détection du type (Excel structuré / PDF contrat / image / Excel libre / CSV)
2. Si image ou PDF scanné : OCR via Infomaniak vision (catégorie `vision`) — différé Phase 4.1+
3. Extraction LLM (catégorie `chat_large`, résolue au runtime) :
   - Prompt système : "Tu extrais des données employés pour un onboarding fiduciaire suisse"
   - Schéma cible : structure salaire.employe
   - Output JSON strict avec niveau de confiance par champ
   - Bbox source (page, coordonnées) pour chaque champ extrait
4. Détection de doublons inter-fichiers (même AVS, même nom + prénom)
5. Création des salaire.proposition_employe en DB
6. Notification au client quand prêt
```

**Stratégie de mapping** : LLM universel au MVP. Au fil des cabinets onboardés, on observe les formats récurrents (Odoo, SAP, Tipee, formats Bexio export) et on crée des **templates** dans `salaire.template_mapping` pour accélérer et fiabiliser.

### 7.5 Écran de validation par cartes employé

Vue : N cartes verticales, 1 par employé détecté.

**Structure d'une carte** :

```
┌─────────────────────────────────────────────────────────┐
│  Jean Dupont                              [Statut: ⏳]  │
│  Sources: contrat_dupont.pdf p.2, ahv.pdf              │
│                                                         │
│  Identité                                              │
│  ├─ Prénom: Jean                         [▓▓▓▓ 95%]   │
│  ├─ Nom: Dupont                          [▓▓▓▓ 95%]   │
│  ├─ Date naissance: 12.03.1985           [▓▓▓░ 80%]   │
│  ├─ Sexe: Masculin                       [▓▓▓░ 75%]   │
│  └─ N° AVS: 756.1234.5678.90             [▓▓▓░ 85%]   │
│                                                         │
│  Coordonnées                                           │
│  ├─ Adresse: Rue du Lac 12, 1003 Lausanne [▓▓▓░ 80%]  │
│  ├─ Canton imposition: VD                [▓▓▓▓ 95%]   │
│  ├─ Nationalité: CH                      [▓▓▓░ 85%]   │
│  ├─ Permis séjour: -                     [▓▓░░ 60%]   │
│  └─ État civil: Marié                    [▓▓▓░ 80%]   │
│                                                         │
│  Contrat                                               │
│  ├─ Date entrée: 01.04.2022              [▓▓▓▓ 95%]   │
│  ├─ Type contrat: CDI                    [▓▓▓░ 85%]   │
│  ├─ Taux activité: 100%                  [▓▓▓▓ 95%]   │
│  ├─ Fonction: Comptable                  [▓▓▓░ 80%]   │
│  └─ Département: Finance                 [▓▓░░ 70%]   │
│                                                         │
│  Rémunération                                          │
│  ├─ Salaire base mensuel: 7'200 CHF      [▓▓▓░ 80%]   │
│  ├─ Nombre versements/an: 13             [▓▓▓░ 80%]   │
│  └─ IBAN: CH93 0076 2011 6238 5295 7    [▓▓▓░ 85%]   │
│                                                         │
│  [Voir docs sources] [Modifier]                        │
└─────────────────────────────────────────────────────────┘
```

**Statuts d'une carte** :
- ⏳ Non validé (au moins 1 champ en attente)
- ✅ Validé (tous les champs validés)
- ⚠️ Anomalie (doublon détecté, conflit entre sources, champ obligatoire manquant)
- 🚫 Rejeté (l'utilisateur a dit "ce n'est pas un employé")

### 7.6 Validation champ par champ (granulaire stricte)

**Principe** : aucun raccourci. Chaque champ Swissdec-ready doit être explicitement validé.

**Pour chaque champ** :
- Affichage de la valeur extraite
- Indicateur de confiance visuel (% + barre colorée)
- Affichage du **fichier source** et de la **zone surlignée** au survol/clic
- Bouton **"Valider"** (confirme la valeur extraite)
- Bouton **"Modifier"** (édite manuellement avant validation)
- Bouton **"Source erronée"** (rejette et passe en saisie manuelle)

**Une fois validé** :
- Le champ devient en lecture seule (cadenas)
- Possible déverrouillage explicite ("Modifier après validation") avec log d'audit

### 7.7 Gestion des cas particuliers

#### Doublons inter-fichiers
Si deux fichiers contiennent des infos sur le même employé (ex. contrat PDF + ligne dans Excel), ZARYA propose une **fusion** :
- Affichage des deux propositions côte à côte
- Pour chaque champ divergent, le client choisit la valeur correcte
- Une seule `salaire.employe` créée au final

#### Champs obligatoires manquants
Si l'IA ne trouve pas de valeur pour un champ Swissdec-ready obligatoire :
- Affichage en rouge dans la carte
- Saisie manuelle requise
- Pas de validation possible tant que pas rempli

#### Données aberrantes
Si l'IA détecte une incohérence (salaire à 50 CHF, date d'entrée future...) :
- Drapeau "Anomalie probable"
- Le client doit confirmer explicitement ou corriger

#### Employés non extraits du fichier
- Bouton "Ajouter un employé manuellement"
- Ouvre le formulaire complet vide

### 7.8 Champs Swissdec-ready obligatoires

Pour valider un employé, **tous** ces champs doivent être renseignés :

**Identité** :
- Prénom, Nom
- Date de naissance
- Sexe
- Numéro AVS (format 756.XXXX.XXXX.XX validé)
- Nationalité (ISO)

**Coordonnées** :
- Adresse complète (rue, NPA, ville, pays)
- Canton et commune d'imposition

**Statut administratif** :
- Permis de séjour (si nationalité ≠ CH)
- État civil
- Nombre d'enfants à charge
- Confession (pour impôt ecclésiastique)

**Contrat** :
- Date d'entrée
- Type de contrat (CDI/CDD/apprentissage/stage)
- Taux d'activité (0-100%)

**Rémunération** :
- Salaire de base mensuel OU salaire horaire
- Nombre de versements annuels (12 ou 13)
- IBAN pour virement

**Champs facultatifs** (peuvent rester vides) :
- Fonction, département
- Téléphone, email personnel
- Numéro externe (ID dans logiciel paie)

## 8. Statut de progression

À tout moment, le client voit son taux d'avancement :

```
ÉTAPE 1 — Identification:   ✅ Terminée
ÉTAPE 2 — Services:         ✅ Terminée
ÉTAPE 3 — Salaires:
  3a. Configuration:        ✅ Terminée
  3b. Référentiel employés: 🔄 12/15 validés (80%)
       Marie Martin:        ✅
       Jean Dupont:         ✅
       ...
       Paul Dubois:         ⏳ 3 champs en attente
       Sophie Tissot:       ⚠️ AVS invalide

[Continuer la saisie]
```

Bouton "Terminer l'onboarding" disponible uniquement quand 100% validé.

## 9. Édition partagée client / fiduciaire

Cohérent avec le reste du module : les deux peuvent éditer librement, qui sauvegarde en dernier l'emporte.

**Cas d'usage typiques** :
- Le client commence, saisit 5 employés, abandonne par fatigue
- La fiduciaire reprend, valide les 5 + ajoute les 10 manquants
- Le client se reconnecte, voit l'état "Saisi par votre comptable", valide explicitement

**Garde-fou** : affichage permanent "Dernière modification par [X] le [date]" sur chaque carte employé.

## 10. Session d'onboarding persistante

L'onboarding peut prendre plusieurs sessions. Tout est sauvegardé en continu :

- Les uploads, extractions, propositions persistent en DB
- Le client peut se déconnecter et revenir
- Pas de timeout strict (mais notification de relance après 7 jours d'inactivité)
- La fiduciaire peut suivre l'avancée en temps réel sur son dashboard

## 11. Réutilisation en cours d'année

Une fois l'onboarding initial terminé, les écrans 7.5 (cartes employé) et 7.6 (validation) sont **réutilisés** dans deux cas :

1. **Vague d'embauches** : nouvelles embauches en masse, le client upload une liste, mêmes écrans
2. **Vague de changements** : modifications massives (réorganisation, augmentation collective), upload d'un Excel comparant ancien et nouveau

Dans ces cas, l'onboarding n'est pas bloquant — c'est un workflow standard de "import employés" depuis le dashboard mensuel.

## 12. Métriques de succès

- **Taux de complétion d'onboarding** : % de clients qui terminent vs abandonnent
- **Temps moyen d'onboarding** : objectif < 60 min pour 10 employés
- **Précision d'extraction IA** : % de champs validés sans modification par le client
- **Taux d'utilisation upload vs saisie manuelle** : indicateur d'adoption IA
- **Nombre de relances fiduciaire** : combien de fois la fiduciaire doit aider

## 13. Hors-scope MVP

- Templates pré-définis par logiciel source (Odoo, SAP, Tipee) — créés au fur et à mesure
- Sources d'identification autres que Zefix (Moneyhouse, ESTV TVA)
- Import direct depuis API Odoo / SAP (Phase 2)
- Validation par lot avec bouton "tout valider si confiance > X%"
- Suggestions IA d'auto-correction ("Avez-vous voulu dire CHF 7'200 plutôt que 7.200?")
- Onboarding multi-établissement en une session
- Import depuis un ancien ZARYA (migration cabinet)

## 14. Questions ouvertes

- [ ] **Quelle catégorie de modèle pour l'extraction** : `chat_large` (qualité) vs `chat_small` (coût), toutes deux via Infomaniak AI Services (Suisse), résolues au runtime via /v1/models ?
- [ ] **OCR via Infomaniak vision (catégorie `vision`, différé Phase 4.1+)** : valider les quotas et latence
- [ ] Comment gérer les **erreurs d'extraction systémiques** (un format de PDF particulier que l'IA loupe toujours) : feedback loop ? amélioration manuelle ?
- [ ] Stockage des fichiers sources : dans Doc Storage + lien, ou dupliqué dans `salaire.session_onboarding` ?
- [ ] Durée de conservation des fichiers sources après validation : à supprimer après X mois pour minimiser le risque RGPD ?
- [ ] Comment gérer l'AVS invalide (checksum incorrect) : refuser ou flagger pour validation manuelle ?
- [ ] Notification de relance après inactivité : à quel délai exact (3, 7, 14 jours) ?
- [ ] Le client peut-il **rejouer** une extraction sur un même fichier si la première passe est mauvaise ?
