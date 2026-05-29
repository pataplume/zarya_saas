---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
flow: G
depends_on: [onboarding-client, multi-tenant, extraction-ia, zefix-integration, dashboard-client]
referenced_by: [onboarding-client]
---

# Flow G — Onboarding client

> Flow utilisateur : un client (PME) est créé dans le tenant cabinet, complète sa fiche entreprise via Zefix, puis son référentiel employés via upload Excel/PDF avec extraction IA et validation granulaire champ par champ.
>
> Voir la spec produit complète dans [`/docs/modules/onboarding-client.md`](../modules/onboarding-client.md).

## Déclencheur
3 déclencheurs possibles :
1. Création d'un nouveau client par le cabinet via le CRM
2. Import en masse depuis l'onboarding fiduciaire (Flow F, étape F)
3. Activation d'un service salaires sur un client existant (déclenche le sous-flow employés)

## Acteurs
- **Cabinet fiduciaire** (Sophie ou collaborateur) : crée le compte client, supervise
- **Contact RH client** (Aïcha ou dirigeant) : remplit les informations
- **Système ZARYA** : extraction IA, validation, création du référentiel

## Pré-requis
- Cabinet onboardé (Flow F terminé)
- Email du contact RH client connu
- Si onboarding salaires : politique de validation granulaire activée

## Étapes détaillées

### Étape 1 — Création du compte client par le cabinet

**Cas 1.A : Création unique**
1. Sophie clique "Ajouter un client" dans le CRM
2. Saisie minimale : raison sociale OU IDE
3. Recherche Zefix automatique (avec consentement)
4. Sélection du résultat → auto-remplissage
5. Choix du contact principal (création `crm.contact` avec `est_contact_rh = true`)
6. Activation des services initiaux (compta, TVA, salaires...)
7. Création `crm.client`, statut `prospect`
8. Création `salaire.acces_client` avec `token_activation` unique
9. Email d'activation envoyé au contact RH

**Cas 1.B : Import en masse (depuis Flow F étape F)**
1. Le cabinet pilote l'import portefeuille en session live avec CSM ZARYA
2. Création de N clients en lot via `proposition_client` → `crm.client`
3. Pour chaque client : `salaire.acces_client` créé en `inactif`
4. Pas d'envoi d'emails d'activation immédiat
5. Le cabinet décide ensuite client par client quand activer

### Étape 2 — Activation du contact RH
1. Le contact RH reçoit l'email d'activation (lien magic 7 jours)
2. Au clic :
   - Page de création de mot de passe
   - Création `auth.users` Supabase
   - `app_metadata.role = 'client_contact'`, `app_metadata.client_id = ...`
   - Activation `salaire.acces_client.actif = true`
3. Redirection vers le wizard d'onboarding client

### Étape 3 — Wizard d'onboarding (Phase 1 : Fiche entreprise)
Le contact RH voit le dashboard client en mode "onboarding bloquant".

**3.A — Confirmation identité entreprise**
- Affichage des données Zefix pré-remplies
- Champs ajoutables : numéro TVA, IBAN, contact secondaire
- Bouton "Confirmer ces informations"

**3.B — Adresses**
- Siège (pré-rempli Zefix)
- Adresse de facturation (peut différer)
- Adresse postale (si encore différente)

**3.C — Contacts additionnels**
- Contact RH principal (déjà créé)
- Contact comptabilité éventuel
- Dirigeant (peut = contact principal)

**3.D — Préférences**
- Langue de communication
- Fuseau horaire
- Canal préféré

**3.E — Validation entreprise complète**
- `crm.client.statut = 'actif'`
- Si service salaires : passage à la Phase 2

### Étape 4 — Wizard d'onboarding (Phase 2 : Référentiel employés)
**Bloquant** : tant que cette phase n'est pas terminée, pas de premier cycle salaire.

**4.A — Choix du mode d'apport**
Le contact RH choisit :
- **Upload Excel/CSV** : si une liste existe (export Bexio, Tipee, fichier maison)
- **Upload PDF de contrats** : si pas d'Excel structuré
- **Saisie manuelle** : pour très petites équipes (< 5 employés)

**4.B — Upload et extraction**
Si Upload :
1. Drag & drop des fichiers
2. Création `salaire.session_onboarding` + `salaire.upload_fichier`
3. Pipeline Extraction IA avec contexte `employes`
4. Modèle : catégorie `chat_large` (résolue au runtime) — précision critique
5. OCR via Infomaniak vision (catégorie `vision`) si PDF scanné — différé Phase 4.1+
6. Output : N `proposition_employe` + détails par champ dans `proposition_champ`

**4.C — Notification au cabinet**
Le cabinet est notifié qu'un onboarding client est en cours, peut suivre l'avancement dans son dashboard.

### Étape 5 — Validation granulaire champ par champ
**Décision actée en [ADR 0007](../architecture/decisions/0007-validation-granulaire-onboarding.md)** : pas de bouton "Tout valider", chaque champ doit être explicitement validé.

Pour chaque employé proposé :

**5.A — Vue d'un employé**
```
┌────────────────────────────────────────┐
│ Employé 5 sur 23                       │
│                                        │
│ Identité                               │
│ ⚪ Prénom : Marie [✓]                  │
│ ⚪ Nom : Martin [✓]                    │
│ ⚪ Date naissance : 14/03/1985 [✓]     │
│ ⚪ Sexe : Femme [✓]                    │
│ ⚪ AVS : 756.1234.5678.90 [✓]          │
│                                        │
│ Emploi                                 │
│ ⚪ Date entrée : 01/06/2020 [✓]        │
│ ⚪ Fonction : Comptable [✓]            │
│ ⚪ Taux : 80% [✓]                      │
│                                        │
│ Rémunération                           │
│ ⚪ Salaire base : 5'500 CHF [✓]        │
│ ⚪ Versements/an : 13 [✓]              │
│ ⚪ IBAN : CH93 0076 ... [✓]            │
│                                        │
│ ⚠️ Anomalie : AVS checksum valide      │
│ ⚠️ Détection : nouvelle adresse vs M-1 │
│                                        │
│ [Précédent] [Continuer] [Mettre de côté]│
└────────────────────────────────────────┘
```

**5.B — Validation 1-clic par champ**
- Au focus sur un champ : pré-rempli avec proposition IA
- Enter ou Tab : valide ce champ, passage au suivant
- Modifier la valeur : `proposition_champ.statut = 'corrige_humain'`, feedback IA enregistré
- Tous les champs validés : `proposition_employe.statut = 'validee'`

**5.C — Détection d'anomalies en temps réel**
- Format AVS : checksum mod-10 vérifié
- IBAN : checksum mod-97 vérifié
- Date d'entrée : pas dans le futur
- Salaire : avertissement si < 1'000 CHF ou > 50'000 CHF
- Affichage en surbrillance + suggestion de correction

**5.D — Sauvegarde automatique**
À chaque champ validé : sauvegarde Postgres temps réel. Aïcha peut quitter et reprendre.

**5.E — Reprise**
Au retour : reprend à l'employé en cours, état complet préservé.

### Étape 6 — Création du référentiel final
Quand tous les employés sont validés :
1. Trigger : pour chaque `proposition_employe.statut = 'validee'`
2. Création `salaire.employe` avec toutes les valeurs validées
3. Pour chaque champ : log dans audit (qui a validé, valeur initiale IA vs finale)
4. Mise à jour `session_onboarding.statut = 'terminee'`
5. Création `crm.evenement` (type `referentiel_employe_initialise`)

### Étape 7 — Notification cabinet et activation
1. Notification au gestionnaire salaires du client : "Référentiel prêt"
2. Activation du cycle mensuel salaires
3. Génération de la première échéance "Validation salaire" pour le mois en cours
4. Possibilité immédiate d'export vers le logiciel paie cabinet

### Étape 8 — Première session du dashboard client en mode opérationnel
Le contact RH revient au dashboard, voit maintenant :
- Action prioritaire : "Pas d'action requise, prochain cycle dans X jours"
- OU : "Validation salaire X mensuelle à faire avant le Y"

L'onboarding client est complet.

## Cas d'erreur

| Cas | Comportement |
|---|---|
| Email d'activation expiré | Le contact RH demande renvoi → cabinet régénère un magic link |
| Upload échoue | Retry, fallback saisie manuelle |
| Extraction IA échoue partiellement | Les champs extraits avec succès sont proposés, les autres restent vides |
| AVS invalide | Saisie obligatoire d'une valeur valide |
| Doublon d'employé détecté | Proposition de fusion |
| Le contact RH abandonne en milieu | Sauvegarde auto, relance email J+3, J+7 |
| Le cabinet a saisi des infos parallèles | Last-write-wins, indication "Modifié par le cabinet" |

## Cas particuliers

### Édition partagée client / fiduciaire
Le cabinet peut éditer les mêmes données que le client (par exemple pour aider Aïcha qui bloque). Politique last-write-wins, log dans audit, affichage de l'auteur de la dernière modification.

### Premier cycle déjà à venir
Si l'onboarding démarre le 18 du mois et que la validation salaires est attendue le 20, alerte explicite. Soit acceleration de l'onboarding, soit report du premier cycle au mois suivant.

### Vague d'embauches (réutilisation du flow)
Une fois le référentiel initial fait, les vagues d'embauches utilisent les **mêmes écrans** mais sans le caractère bloquant. Aïcha peut ajouter 3 employés en cours d'année via le même wizard.

### Client sans service salaires
Si pas de service `salaires` activé : la Phase 2 (référentiel employés) est sautée. L'onboarding se termine après la Phase 1.

### Multiple contacts RH
Plusieurs contacts RH peuvent participer à l'onboarding. Last-write-wins entre eux aussi. Affichage des actions de chacun.

## Points d'extension Phase 2+

- **Templates de mapping** par format source (export Bexio, Tipee, Odoo) pour accélérer l'extraction
- **Onboarding partenaire** : un comptable freelance qui s'occupe de plusieurs PME
- **Pre-population intelligente** : si plusieurs employés similaires (titre, salaire), suggestion
- **Mode "co-onboarding"** : Aïcha et Marc en visio en même temps pour les cas complexes
- **Import depuis logiciel RH** (Tipee, BambooHR) avec API

## Métriques à instrumenter

- Taux de complétion de l'onboarding client (objectif > 80%)
- Temps moyen pour compléter (objectif < 3h pour 30 employés)
- Taux d'abandon par étape
- Taux de validation 1-clic par champ vs correction
- Taux de réutilisation pour vagues d'embauche (signal d'adoption)
- Précision IA par champ (AVS, IBAN, salaire, date)
- Délai entre création par cabinet et activation par contact RH

## Dépendances code

- Module Onboarding Client ([`onboarding-client.md`](../modules/onboarding-client.md))
- Module Dashboard Client ([`dashboard-client.md`](../modules/dashboard-client.md))
- Module Extraction IA ([`extraction-ia.md`](../modules/extraction-ia.md))
- Intégration Zefix ([`zefix-integration.md`](../architecture/zefix-integration.md))
- Schémas onboarding ([`onboarding-client-schema.md`](../data-model/onboarding-client-schema.md))
- ADR 0007 validation granulaire ([`0007`](../architecture/decisions/0007-validation-granulaire-onboarding.md))
- ADR 0008 mini-dashboard client ([`0008`](../architecture/decisions/0008-mini-dashboard-client.md))
