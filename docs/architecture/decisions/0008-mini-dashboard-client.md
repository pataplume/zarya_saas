---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [dashboard-client, onboarding-client, salaire]
---

# ADR 0008 — Mini-dashboard client dédié vs validation par email Excel

## Statut
Acceptée — 26 mai 2026

## Contexte

Pour le cycle mensuel de validation salaire et l'onboarding initial, le **client final** (PME) doit interagir avec ZARYA pour :
- Valider les éléments paie du mois (heures, primes, absences)
- Compléter le référentiel employé à l'onboarding
- Signaler les changements (embauche, départ, modification)

Deux modèles d'interaction envisagés :

**Option A — Email + Excel** (classique fiduciaire) :
- ZARYA envoie un Excel pré-rempli au contact RH chaque mois
- Le contact RH modifie et renvoie par email
- ZARYA parse l'Excel reçu et applique

**Option B — Mini-dashboard client web** :
- Le contact RH se connecte à un dashboard ZARYA dédié
- Édition en ligne, sauvegarde temps réel
- Validation 1-clic

**Option C — Hybride** :
- Email comme déclencheur, Excel comme alternative
- Dashboard pour ceux qui préfèrent

## Décision

**Option B — Mini-dashboard client web dédié, avec branding du cabinet.**

Pas d'option Excel par email au MVP. Tous les contacts RH passent par le dashboard. Réversible en Phase 2 si feedback négatif fort.

## Raisons

### Pourquoi dashboard (Option B) plutôt qu'Excel (Option A)
- **Single source of truth** : pas de désynchronisation entre l'Excel envoyé et la version actuelle des données
- **Pas de problème de format** : Excel parsing est fragile (versions différentes, formats régionaux, colonnes ajoutées par l'utilisateur)
- **Audit trail riche** : qui a modifié quoi, quand, depuis quelle IP
- **Validation en temps réel** : checksum AVS, format IBAN détectés instantanément
- **UX mobile** : le contact RH peut valider depuis son téléphone
- **Pas d'aller-retour email** : 50% des emails de validation arrivent en retard ou perdus
- **Multi-canal cohérent** : le dashboard sert aussi à l'onboarding, à la consultation des documents

### Pourquoi pas hybride (Option C)
- **Complexité doublée** : 2 chemins à maintenir, 2 sources de vérité possibles
- **Pas d'effet pédagogique** : si Excel disponible, les clients y resteront
- **Risque de désynchronisation** : un même client mixe les 2, conflits inévitables
- **Coût de support** : "ça vient d'Excel ou du dashboard ?" → débogage long

### Le pari sur le dashboard
ZARYA fait le pari que :
1. Les contacts RH PME en 2026 acceptent un dashboard simple
2. La friction de "se connecter" est compensée par les gains (rapidité, conformité)
3. Les cabinets accompagnent leurs clients à l'adoption

Si ce pari est faux (feedback massif négatif), Option A devient un fallback Phase 2.

## Conséquences

### Positives
- **Données toujours à jour** : pas de risque d'écraser une modif récente
- **Validation 1-clic** quand tout est OK : gain de temps massif côté contact RH
- **Mobile-first** : majorité des consultations sur téléphone
- **Branding cabinet** : le contact RH voit "son cabinet" dans le dashboard (renforce la relation)
- **Architecture cohérente** : même UI pour onboarding, validation mensuelle, consultation docs
- **Sécurité accrue** : auth, audit, RLS, vs emails non sécurisés
- **Notifications maîtrisées** : max 1 email/jour au contact RH (digest)

### Négatives
- **Friction initiale** : créer un compte, se connecter
- **Adoption variable** : certains contacts RH (notamment seniors) peuvent résister
- **Dépendance internet** : pas de mode offline au MVP
- **Coût UX** : il faut soigner massivement l'UX pour battre Excel
- **Onboarding du contact RH** : étape de plus pour l'onboarding global

### Neutres
- Le dashboard sert aussi à la consultation des documents transmis (valeur ajoutée)
- Possibilité d'ajouter Excel en Phase 2 si feedback négatif

## Mitigations de la friction

### UX exceptionnelle
- Page d'accueil contextuelle (action prioritaire mise en avant)
- Validation 1-clic quand tout est conforme
- Sauvegarde temps réel (pas de bouton "Save")
- Reprise possible (le contact peut quitter et revenir)
- Mobile-first

### Microcopy sans jargon
- "Remboursements" au lieu de "indemnités forfaitaires"
- "Bonus du mois" au lieu de "variables"

### Branding cabinet
- Logo et couleurs du cabinet (pas ZARYA)
- Sentiment d'être "chez le fiduciaire", pas "chez un outil tiers"

### Notifications proactives
- Email J-5 : "Validation salaire à faire"
- Email J-2 : "Rappel"
- Email J+1 si retard : "Toujours pas validé"

### Support cabinet
- Le cabinet peut accompagner le client à la première utilisation
- Help center accessible directement dans le dashboard

## Alternatives écartées

### Option A (Excel email)
- Industrielle mais fragile
- Pas de validation temps réel
- Audit faible
- Pas adapté à 2026

### Option C (hybride)
- Complexité multipliée par 2
- Pas de gain UX réel
- Risque de désynchronisation

### Option D (signature électronique uniquement)
- DocuSign pour valider les éléments paie : trop lourd
- Pas adapté au caractère récurrent (mensuel)

## Risques mitigés

### Abandon du dashboard par les contacts RH
**Mitigation** :
- UX simplissime
- Accompagnement cabinet à la première utilisation
- Monitoring du taux d'adoption par cabinet
- Plan B : Option A en Phase 2 si abandon > 30%

### Cabinet réticent à pousser le dashboard à ses clients
**Mitigation** :
- Argumentaire commercial : gain de temps pour le cabinet (plus de relances)
- Onboarding du cabinet par ZARYA inclut formation sur la présentation aux clients
- Communications-types fournies pour les clients

### Contact RH âgé ou peu numérique
**Mitigation** :
- Mobile-first et UI très simple
- Possibilité que le cabinet saisisse à la place du client (édition partagée last-write-wins)
- Tutoriel vidéo de 2 minutes

### Données mal interprétées dans le dashboard
**Mitigation** :
- Aide contextuelle sur chaque champ
- Détection d'anomalies en temps réel
- Workflow de correction si erreur détectée

## Conditions de révision

À reconsidérer si :
- Taux d'adoption < 70% à 3 mois après lancement
- Feedback massif "j'ai pas le temps de me connecter"
- Demande forte des cabinets pour l'option Excel
- Évolution réglementaire forçant un mode de transmission spécifique

## Implémentation

Voir :
- [`/docs/modules/dashboard-client.md`](../../modules/dashboard-client.md) — spec complète du dashboard
- [`/docs/modules/onboarding-client.md`](../../modules/onboarding-client.md) — usage à l'onboarding
- [`/docs/modules/salaire.md`](../../modules/salaire.md) — usage au cycle mensuel

## Liens connexes

- ADR 0005 — Multi-tenant natif (le contact RH a un accès scopé via `salaire.acces_client`)
- ADR 0007 — Validation granulaire onboarding (le dashboard est le contexte UX de cette validation)
