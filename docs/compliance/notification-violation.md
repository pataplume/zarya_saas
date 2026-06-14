---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
type: compliance
depends_on: [security-and-audit, dpa-template]
referenced_by: [_index, dpa-template, politique-confidentialite]
---

# Procédure de notification de violation de données

> Procédure opérationnelle en cas de violation de données personnelles. Conforme RGPD art. 33-34 et nLPD art. 24.
>
> **Critique** : à exécuter rapidement (72h pour autorités, sans délai pour personnes).

## 1. Définition d'une violation

Une **violation de données personnelles** est un événement entraînant, de manière accidentelle ou illicite :
- **Destruction** des données
- **Perte** des données
- **Altération** non autorisée
- **Divulgation** non autorisée
- **Accès** non autorisé

Exemples :
- Accès aux données d'un cabinet par un autre cabinet (faille RLS)
- Vol de credentials administrateur ZARYA
- Compromission d'un sous-traitant (AWS, Supabase, etc.)
- Perte d'un device contenant des credentials
- Bug entraînant la divulgation publique de données
- Ransomware sur l'infrastructure
- Erreur d'envoi d'email contenant des données sensibles
- Suppression involontaire massive de données sans backup

## 2. Niveaux de gravité

### Niveau 1 — Mineure
- Pas de PII exposée
- Pas de risque pour les personnes
- Ex : accès non autorisé à des données non personnelles (configuration interne)

**Action** : documentation interne, pas de notification externe.

### Niveau 2 — Modérée
- PII non sensibles exposées à un nombre limité
- Risque limité pour les personnes
- Ex : fuite d'emails professionnels d'un cabinet vers un autre cabinet, sans contenu

**Action** : notification PFPDT/CNIL dans les 72h, pas de notification aux personnes (risque non élevé).

### Niveau 3 — Élevée
- PII sensibles exposées OU large volume OU risque concret
- Ex : fuite de données salariales, IBAN, numéros AVS, médicaux

**Action** : notification PFPDT/CNIL dans les 72h **ET** notification aux personnes concernées dans les meilleurs délais.

### Niveau 4 — Critique
- Compromission massive de l'infrastructure
- Risque pour la sécurité physique ou financière des personnes
- Ex : ransomware exfiltrant des données salariales massives

**Action** : niveau 3 + plan de gestion de crise complet + communication publique.

## 3. Workflow opérationnel

### Étape 0 — Détection
Sources possibles de détection :
- Alertes monitoring (Sentry, logs Vercel, anomalies dans l'audit log)
- Notification d'un sous-traitant (Supabase, AWS, Vercel incident)
- Signalement par un cabinet client
- Signalement par un chercheur externe (bug bounty Phase 3)
- Audit interne ou pen test

**Horloge 72h démarre à la "prise de connaissance" effective**, pas à la détection brute.

### Étape 1 — Containment (T+0 à T+4h)
**Priorité absolue : arrêter la fuite**.

1. **Isoler** la cause :
   - Couper l'accès compromis
   - Désactiver le service défaillant
   - Suspendre les exports
2. **Sécuriser** les systèmes adjacents
3. **Préserver les preuves** (logs, snapshots DB)
4. **Activer la cellule de crise** : Tristan + responsable technique + DPO + juriste

### Étape 2 — Évaluation initiale (T+4h à T+12h)
1. **Nature exacte** de la violation
2. **Données concernées** : catégories et volumes
3. **Personnes concernées** : nombre, profil, juridictions
4. **Période** : depuis quand ?
5. **Cause probable** : faille technique, erreur humaine, attaque externe
6. **Niveau de gravité** déterminé (1 à 4)

### Étape 3 — Notification interne (T+4h)
- Direction ZARYA informée
- Cabinets clients potentiellement impactés informés en priorité
- Sous-traitants informés si concerné

### Étape 4 — Notification autorités (avant T+72h)
Pour niveau 2+ :

#### Suisse — PFPDT
- Email : info@edoeb.admin.ch
- Formulaire en ligne : https://www.edoeb.admin.ch/edoeb/fr/home/protection-des-donnees.html
- Contenu requis :
  - Nature de la violation
  - Catégories et nombre de personnes concernées
  - Catégories et nombre d'enregistrements
  - Conséquences probables
  - Mesures prises ou proposées

#### UE — CNIL (France) ou homologue
- Si des résidents UE sont concernés
- Notification dans le pays de l'autorité chef de file ou par défaut CNIL
- Formulaire en ligne

#### Délai
**72 heures** maximum à compter de la prise de connaissance. Si dépassé : justification obligatoire.

### Étape 5 — Notification aux personnes (T+72h max si niveau 3+)
Pour niveau 3+ :
- Email direct aux personnes concernées
- Si impossible (volume, manque de contact direct) : communication publique
- Contenu :
  - Nature de la violation
  - Conséquences probables pour la personne
  - Mesures de protection recommandées (changement de mot de passe, surveillance compte, etc.)
  - Contact pour plus d'informations

### Étape 6 — Notification cabinets clients (sous 24h)
Selon le DPA :
- Email au DPO du cabinet ou contact principal
- Information sur la nature et l'étendue
- Coordination sur la communication aux personnes (si le cabinet est responsable principal)

### Étape 7 — Résolution et mesures correctives
1. **Eradication** de la cause racine
2. **Recovery** des systèmes affectés
3. **Hardening** pour empêcher la récurrence
4. **Tests** pour confirmer la résolution
5. **Communication finale** aux parties prenantes

### Étape 8 — Post-mortem (T+30 jours)
1. **Analyse complète** de l'incident
2. **Lessons learned** documentées
3. **Actions correctives** planifiées
4. **Mise à jour des procédures**
5. **Communication transparente** aux clients impactés

## 4. Modèles de notification

### 4.1 Email PFPDT type

```
À: info@edoeb.admin.ch
Objet: Notification de violation de données personnelles — ZARYA SA

Conformément à l'art. 24 al. 1 nLPD, ZARYA SA, sous-traitant
de données personnelles, notifie la violation suivante :

1. Identité du responsable :
   ZARYA SA
   [Adresse, IDE]
   Contact : dpo@zarya.ch

2. Date et durée de la violation :
   - Date de l'événement : [DATE]
   - Date de la prise de connaissance : [DATE+HEURE]
   - Durée : [...]

3. Nature de la violation :
   [Description précise]

4. Catégories et nombre approximatif de personnes concernées :
   [...]

5. Catégories de données concernées :
   [...]

6. Conséquences probables :
   [...]

7. Mesures prises ou proposées :
   - Immédiates : [...]
   - À court terme : [...]
   - À moyen terme : [...]

8. Coordonnées DPO pour suivi :
   dpo@zarya.ch
   +41 [...]

Cordialement,
[Nom du signataire]
DPO / Représentant légal ZARYA SA
```

### 4.2 Email aux personnes concernées type

```
Objet: Information importante concernant vos données — ZARYA

Madame, Monsieur [Prénom Nom],

Nous tenons à vous informer d'un incident de sécurité ayant
affecté certaines de vos données personnelles traitées via
la plateforme ZARYA.

🚨 Que s'est-il passé ?
[Description claire, sans jargon]

📋 Quelles données ont été concernées ?
[Liste précise, sans alarmisme excessif]

⚠️ Quelles peuvent être les conséquences pour vous ?
[Évaluation honnête]

🛡️ Quelles mesures recommandons-nous ?
- [Action 1]
- [Action 2]
- [Action 3]

✅ Quelles mesures avons-nous prises ?
[Liste des actions ZARYA]

❓ Vous avez des questions ?
Contactez-nous à dpo@zarya.ch ou au +41 [...].

Vous pouvez également déposer une réclamation auprès du PFPDT
(Préposé fédéral à la protection des données et à la transparence).

Avec nos excuses pour ce désagrément,
L'équipe ZARYA
```

### 4.3 Email cabinet client type

```
Objet: [URGENT] Notification d'incident de sécurité — ZARYA

Bonjour [Nom du contact],

Nous vous informons d'un incident de sécurité affectant
potentiellement votre cabinet et/ou vos clients.

Détails de l'incident :
[Description technique]

Données potentiellement affectées :
- Cabinet : [...]
- Clients PME concernés : [...]

Actions immédiates prises par ZARYA :
[...]

Actions recommandées de votre côté :
[...]

Coordination :
Conformément au DPA, ZARYA s'engage à vous assister dans
la gestion de cet incident. Un point de contact dédié :
[Nom] [email] [téléphone]

Nous restons à votre disposition pour toute question.

Cordialement,
[Nom signataire]
DPO ZARYA SA
```

## 5. Outils et infrastructure

### 5.1 Détection
- **Sentry** : erreurs applicatives
- **Logs Vercel** : métriques et alertes de l'hébergement applicatif (Frankfurt)
- **Logs Postgres** : requêtes RLS échouées
- **Audit log** : modifications massives ou anormales
- **PostHog** : signaux comportementaux anormaux

### 5.2 Réponse
- **Status page** publique (Phase 2) pour informer les utilisateurs
- **Templates emails** pré-rédigés et validés juridiquement
- **Liste de contacts** PFPDT, CNIL, juristes, presse spécialisée
- **Cellule de crise** avec rôles définis

### 5.3 Documentation
- **Tous les incidents** documentés dans `audit.security_incident` (à créer)
- **Lessons learned** dans le wiki interne
- **Procédures** mises à jour après chaque incident

## 6. Tests de la procédure

### 6.1 Drills réguliers
- **Annuel** : exercice complet de simulation d'incident
- **Trimestriel** : drill ciblé sur un aspect (notification, communication)
- **Mensuel** : revue des alertes et seuils de détection

### 6.2 Tests automatisés
- Tests d'isolation multi-tenant en CI (cf. `dev-environment.md`)
- Tests de chaos engineering (Phase 2)
- Pen test annuel à partir de Phase 2

## 7. Coordination avec sous-traitants

### 7.1 Notification entrante
Chaque sous-traitant a une obligation contractuelle de notifier ZARYA en cas de violation chez eux. Délais :
- AWS : selon DPA AWS
- Supabase : selon DPA Supabase
- Microsoft : selon DPA Microsoft

À surveiller : pages de status des fournisseurs critiques.

### 7.2 Notification sortante
Si la violation chez ZARYA implique de la suspendre vis-à-vis d'un sous-traitant (ex. révocation de credentials), procédure rapide définie.

## 8. Conservation des preuves

Pour chaque violation, conservation pendant **6 ans minimum** de :
- Logs techniques (audit, Sentry, etc.)
- Notifications envoyées
- Décisions de la cellule de crise
- Communications avec les autorités
- Mesures correctives

Stockage : Supabase Storage chiffré + backup externe.

## 9. Confidentialité et communication

### 9.1 Pendant l'incident
- Communication interne **strictement limitée** à la cellule de crise
- Pas de communication externe non coordonnée
- Pas de communication aux médias avant notification autorités et personnes

### 9.2 Post-incident
- Communication transparente avec les cabinets clients
- Communication publique si nécessaire (status page, blog post)
- Pas de minimisation, pas d'omission

## 10. Sanctions encourues

### 10.1 nLPD (Suisse)
- Amendes jusqu'à **250'000 CHF** pour les personnes physiques responsables
- Sanctions pénales possibles pour non-notification

### 10.2 RGPD (UE)
- Amendes jusqu'à **20M EUR ou 4% du CA mondial**
- Sanctions civiles supplémentaires (dommages-intérêts)

### 10.3 Réputation
- Impact très significatif sur la confiance des cabinets clients
- Risque de churn massif
- Difficulté à acquérir de nouveaux clients

**Conséquence pratique** : la conformité de cette procédure est un **investissement critique**, pas optionnel.

## 11. Contacts d'urgence

### 11.1 Équipe ZARYA
- DPO : dpo@zarya.ch
- Security : security@zarya.ch
- CEO : [direct]
- CTO : [direct]

### 11.2 Externes
- Juriste cyber : [à identifier]
- Cabinet d'investigation forensique : [à identifier]
- Assurance cyber : [à souscrire Phase 2]
- PFPDT : info@edoeb.admin.ch / +41 58 462 43 95
- CNIL : 01 53 73 22 22

### 11.3 Sous-traitants critiques
- AWS Support : portail dédié
- Supabase Support : support@supabase.io
- Microsoft Support : portail dédié

## 12. À tenir à jour

Procédure révisée :
- Annuellement
- Après chaque incident (lessons learned)
- À chaque évolution réglementaire majeure
- À chaque ajout de sous-traitant critique

Formation équipe associée mise à jour en conséquence.

## 13. Documents associés

- [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md) — mesures préventives
- [`/docs/compliance/dpa-template.md`](./dpa-template.md) — obligations contractuelles avec cabinets
- [`/docs/compliance/sous-traitants.md`](./sous-traitants.md) — coordination sous-traitants
- [`/docs/compliance/droits-personnes.md`](./droits-personnes.md) — droits éventuels post-violation
