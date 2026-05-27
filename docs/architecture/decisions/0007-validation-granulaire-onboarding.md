---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [onboarding-client, extraction-ia]
---

# ADR 0007 — Validation granulaire (champ par champ) à l'onboarding client

## Statut
Acceptée — 26 mai 2026

## Contexte

L'onboarding client (PME) implique l'extraction massive de données employés depuis des Excel ou PDFs : 5 à 50 employés, chacun avec 20+ champs (identité, AVS, IBAN, salaire, type de contrat, etc.).

Pour l'**onboarding fiduciaire** (cabinet), l'IA propose une liste de clients à importer et le responsable cabinet valide en lot — décision distincte, voir [`onboarding-fiduciaire.md` § 10.4](../../modules/onboarding-fiduciaire.md).

Pour l'**onboarding client** (employés), la décision se pose : validation en lot ou validation granulaire champ par champ ?

Options évaluées :

1. **Validation en lot** : l'utilisateur voit tous les employés, valide tout en bloc ou rejette
2. **Validation par employé** : un employé à la fois, validation globale de l'employé
3. **Validation granulaire stricte** : champ par champ pour chaque employé, pas de raccourci
4. **Validation hybride** : 1-clic si tous les champs > seuil de confiance, sinon validation détaillée

## Décision

**Validation granulaire stricte champ par champ pour l'onboarding client (employés).**

Chaque champ d'un employé doit être **explicitement validé** par le contact RH du client, même si l'IA propose une valeur avec haute confiance. Pas de bouton "Tout valider" qui passe par-dessus la vérification champ par champ.

## Raisons

### Pourquoi cette rigueur sur les employés
- **Conséquences d'erreurs catastrophiques** : un numéro AVS erroné = salaire envoyé au mauvais compte AVS = correctifs lourds, parfois années plus tard
- **IBAN erroné** : salaire versé sur mauvais compte = litige, fraude possible
- **Date de naissance erronée** : impacte LPP, retraites
- **Salaire erroné** : litige employé, redressement
- **Données rarement re-vérifiées** : une fois l'onboarding fait, ces données alimentent le système pendant des années

### Pourquoi pas validation en lot
- Le contact RH **ne lira pas** chaque champ si le bouton "Tout valider" est disponible
- Le taux d'erreurs IA, même à 95% de précision, signifie que **5% des données seront fausses** sans validation humaine
- 5% × 30 employés × 20 champs = 30 erreurs en moyenne par onboarding → inacceptable

### Pourquoi pas validation par employé seul
- Validation au niveau employé sans regarder chaque champ revient au lot en pratique
- L'utilisateur va valider rapidement sans lire le détail

### Pourquoi pas hybride
- Discriminer "haute confiance" vs "basse confiance" est subjectif
- Risque que l'utilisateur valide en confiance même les cas où l'IA a halluciné

### Le coût de friction est acceptable
- 30 employés × 5 minutes par employé = 2-3 heures d'onboarding
- C'est le bon prix à payer pour avoir une base de référence fiable pour les années suivantes
- Une fois fait, l'onboarding n'est plus à refaire (les changements ultérieurs passent par `salaire.changement`, eux aussi validés granulairement)

## Conséquences

### Positives
- **Qualité du référentiel employé garantie** dès le départ
- **Responsabilisation du contact RH** : il valide explicitement chaque info qui le concerne
- **Audit trail riche** : pour chaque champ, qui l'a validé, quand, à quel niveau de confiance IA
- **Feedback IA** : chaque correction améliore les prompts (boucle d'apprentissage)
- **Confiance du fiduciaire** dans les données reçues : sait qu'elles ont été validées humainement

### Négatives
- **Temps d'onboarding plus long** : 2-3h vs 30 min en validation lot
- **Friction potentielle** : certains contacts RH peuvent abandonner l'onboarding
- **Coût opérationnel** : plus d'aide-utilisateur nécessaire si confusion

### Neutres
- Implique une UX soignée pour rendre la validation agréable (validation 1-clic par champ si l'IA est juste, correction inline si non)
- Les vagues d'embauche ultérieures réutilisent le même flow mais sont moins volumineuses

## Mitigations de la friction

### UX soignée pour rendre la validation rapide
- **Validation 1-clic par champ** quand l'IA est confiante : Enter pour valider, Tab pour suivant
- **Pre-population intelligente** : si l'IA a déjà vu un employé similaire dans le cabinet, valeurs suggérées
- **Raccourcis clavier** : navigation au clavier sans souris
- **Sauvegarde automatique** : pas de risque de perdre du travail
- **Reprise possible** : le contact RH peut quitter et revenir, l'IA garde l'état

### Découpage en sessions
- Pas de wizard monolithique : possibilité de faire 5 employés, partir, revenir le lendemain
- Statut visible : "12 / 30 employés validés"

### Aide contextuelle
- Tooltips explicatifs sur chaque champ sensible (AVS, IBAN)
- Validation côté client en temps réel (format AVS, checksum IBAN)
- Détection d'anomalies affichée (salaire anormalement bas, date future)

## Alternatives écartées

### Hybride : 1-clic global si tous les champs > 0.95
- Risqué : l'IA peut avoir une confiance élevée et se tromper
- Trop d'enjeux sur ces données pour faire confiance à un seuil

### Validation par lots de 5 employés
- Compromise inutile : soit on valide chaque champ, soit on valide en bloc, pas d'intermédiaire pertinent

### Validation différée (faire de l'onboarding rapide puis corriger plus tard)
- En pratique, ça ne se passe jamais : le cabinet exporte les salaires dès le 1er mois avec les données erronées

## Risques mitigés

### Abandon d'onboarding
**Mitigation** :
- UX optimisée pour la rapidité (1-clic par champ)
- Sauvegarde automatique
- Reprise possible
- Support cabinet pour accompagner si bloqué

### Mauvaise expérience contact RH
**Mitigation** :
- Microcopy claire et empathique
- Aide contextuelle
- Possibilité de demander de l'aide au cabinet via dashboard

### Erreurs malgré la validation
**Mitigation** :
- Détection d'anomalies pendant la validation (AVS checksum, IBAN format)
- Audit trail pour identifier qui a validé quoi
- Possibilité de modifier post-validation avec workflow de correction

## Conditions de révision

À reconsidérer si :
- Taux d'abandon onboarding > 30% (signal que la friction est trop forte)
- Feedback massif des cabinets pilotes "trop long"
- Amélioration significative de la précision IA (> 99%) sur les corpus fiduciaires
- Émergence d'un workflow alternatif validé en interview

## Implémentation

Voir :
- [`/docs/modules/onboarding-client.md`](../../modules/onboarding-client.md) — spec UX du workflow
- [`/docs/data-model/onboarding-client-schema.md`](../../data-model/onboarding-client-schema.md) — tables `proposition_employe` + `proposition_champ` (granularité par champ)
- [`/docs/modules/extraction-ia.md`](../../modules/extraction-ia.md) — pipeline qui produit les propositions

## Liens connexes

- ADR 0008 — Mini-dashboard client (le contexte UX où cette validation a lieu)
- ADR 0006 — Onboarding self-service (l'onboarding fiduciaire qui contient le portfolio des clients à onboarder)
