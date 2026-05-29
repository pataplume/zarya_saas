---
status: draft
owner: tristan
last_updated: 2026-05-26 (v0.2 — ajout Pack de déploiement initial)
priority: P0
type: compliance
public: true
depends_on: [politique-confidentialite, pricing]
referenced_by: [_index]
---

# Conditions Générales d'Utilisation ZARYA

> Contrat entre ZARYA SA et les cabinets fiduciaires clients. **À valider impérativement par un juriste suisse avant utilisation contractuelle**.

> **Dernière mise à jour** : [À compléter à la publication]
> **Version** : 1.0

## Article 1 — Objet

Les présentes Conditions Générales d'Utilisation (ci-après "**CGU**") régissent l'utilisation de la plateforme logicielle ZARYA (ci-après "**la Plateforme**" ou "**le Service**") par tout utilisateur (ci-après "**le Client**" lorsqu'il s'agit d'un cabinet fiduciaire, ou "**l'Utilisateur**" pour un usage individuel).

ZARYA est une plateforme SaaS d'assistance à la gestion fiduciaire offrant des fonctionnalités de gestion documentaire, suivi des échéances, classification automatisée, et traitements assistés par intelligence artificielle.

## Article 2 — Définitions

- **ZARYA** : ZARYA SA, société à incorporer, ayant son siège à [adresse], Genève, Suisse.
- **Client** : cabinet fiduciaire ayant souscrit à un Plan, agissant en qualité d'entité juridique.
- **Utilisateur** : personne physique utilisant la Plateforme, qu'elle soit membre d'un cabinet Client ou contact d'un client final du Cabinet.
- **Plan** : offre commerciale (Starter, Pro, Enterprise) telle que décrite sur zarya.ch/pricing.
- **Tenant** : espace de données isolé et propre à chaque Client.
- **Données du Client** : ensemble des données importées, créées, ou générées dans le tenant du Client.
- **Données Personnelles** : telles que définies par la nLPD et le RGPD.

## Article 3 — Acceptation et accès au Service

### 3.1 Acceptation
L'inscription à la Plateforme et l'utilisation du Service valent acceptation pleine et entière des présentes CGU, de la Politique de Confidentialité, et du Contrat de Sous-Traitance (DPA) applicable.

### 3.2 Capacité
Le Client garantit qu'il est une entité juridique habilitée à contracter et que la personne acceptant les CGU a le pouvoir d'engager le Client.

### 3.3 Création du compte
Le Client crée son compte via l'onboarding self-service, en fournissant des informations exactes et à jour.

## Article 4 — Description du Service

### 4.1 Périmètre
ZARYA fournit un ensemble de modules (Doc, CRM, Calendar, Facture, Salaire, Search, Onboarding) variant selon le Plan souscrit. Voir [zarya.ch/pricing](https://zarya.ch/pricing) pour la matrice des fonctionnalités.

### 4.2 Évolutions
Le Service peut évoluer (ajout, modification, retrait de fonctionnalités). ZARYA s'engage à :
- Ne pas dégrader significativement les fonctionnalités principales sans préavis
- Notifier les évolutions majeures avec **30 jours de préavis**
- Maintenir une période de migration en cas de changement disruptif

### 4.3 Disponibilité
Hors plan Enterprise (SLA contractuel), ZARYA s'engage à un objectif de disponibilité de **99% sur base mensuelle**, hors maintenances planifiées (notifiées 48h à l'avance).

## Article 5 — Souscription, abonnement, paiement

### 5.1 Plans disponibles
- **Starter** : 199 CHF HT/mois
- **Pro** : 499 CHF HT/mois
- **Enterprise** : sur devis

Détails et limites de chaque Plan : [zarya.ch/pricing](https://zarya.ch/pricing) (incorporé par référence).

### 5.2 Pack de déploiement initial

En complément de l'abonnement récurrent, ZARYA propose un **Pack de déploiement initial** (ci-après "Pack de Déploiement") facturé une seule fois lors du démarrage du Service. Ce Pack couvre la configuration assistée, l'import du portefeuille, la formation équipe, et l'accompagnement des 30 premiers jours.

**Modalités selon le Plan** :
- **Starter** : Pack **optionnel**. Self-service à 0 CHF par défaut. Pack démarrage assisté à **490 CHF HT** disponible sur demande.
- **Pro** : Pack **fortement recommandé** à **2'900 CHF HT** (tarif standard). Devient **obligatoire** si le Client demande l'import de plus de 50 clients PME. Tarif early adopter de **1'500 CHF HT** disponible pour les premiers cabinets Founding Partners (selon offre commerciale en vigueur).
- **Enterprise** : Pack **systématique sur devis**, à partir de **5'000 CHF HT**.

**Contenu détaillé** : voir [zarya.ch/pricing](https://zarya.ch/pricing).

**Modalités de paiement du Pack** :
- Facturation à la signature du contrat ou à la date de kick-off (selon convention)
- Paiement en une fois, ou échelonné 50% kick-off + 50% à la livraison (sur demande, Pro et Enterprise)
- Non remboursable une fois le kick-off effectué, sauf cas exceptionnels (garantie satisfaction 30 jours sur certaines prestations à définir au cas par cas)

**Articulation avec le Service** :
- Le Pack de Déploiement est **distinct** de l'abonnement récurrent
- L'absence de Pack n'empêche pas l'accès au Service (Starter self-service)
- Les remises sur l'abonnement (offres lancement) **ne s'appliquent pas** au Pack sauf mention explicite

### 5.3 Période d'essai
Le Client bénéficie d'une période d'essai gratuite de **14 jours** sans engagement, sans Pack de Déploiement. À l'issue, sans souscription active, l'accès est suspendu (lecture seule 7 jours, puis archivage).

### 5.4 Paiement
- **Mensuel** : prélevé en début de période via Stripe (carte bancaire)
- **Annuel** (Pro et Enterprise) : facture annuelle avec remise 15% sur l'abonnement (pas sur le Pack), paiement par virement IBAN
- **Pack de Déploiement** : facture à part, paiement par virement IBAN sous 30 jours
- **TVA suisse 8.1%** applicable aux Clients en Suisse, tant sur l'abonnement que sur le Pack

### 5.5 Renouvellement
Renouvellement automatique sauf résiliation par le Client à au moins **30 jours** avant la fin de la période. Le Pack de Déploiement n'étant pas récurrent, il n'est pas concerné par le renouvellement.

### 5.6 Changement de Plan
- **Upgrade** : effet immédiat, prorata calculé sur l'abonnement. Si l'upgrade implique un Pack supplémentaire (Starter → Pro), celui-ci peut être proposé (non obligatoire si pas d'import nouveau).
- **Downgrade** : effet à la fin de la période de facturation, sous réserve que les limites du nouveau Plan soient respectées

### 5.7 Défaut de paiement
- Premier rappel : J+7 après échéance
- Deuxième rappel : J+14
- Suspension : J+21 (accès lecture seule)
- Résiliation : J+45 (archivage des données 90 jours puis suppression, sous réserve obligations légales)

Pour le Pack de Déploiement : défaut de paiement entraîne suspension immédiate des prestations associées (kick-off, formation, accompagnement). L'abonnement reste actif si à jour de paiement.

### 5.8 Prix
ZARYA se réserve le droit de modifier ses prix avec un préavis de **90 jours**. Les nouveaux prix s'appliquent aux renouvellements suivants pour l'abonnement et aux nouvelles souscriptions pour le Pack de Déploiement.

## Article 6 — Données du Client et propriété intellectuelle

### 6.1 Propriété des Données
**Le Client conserve l'intégralité des droits de propriété sur ses Données.**

ZARYA bénéficie d'une licence limitée et révocable pour :
- Héberger et traiter les Données dans le cadre du Service
- Conduire les analyses techniques nécessaires au fonctionnement et à l'amélioration du Service (sans identification personnelle)

### 6.2 ZARYA n'utilise jamais les Données pour
- Entraîner des modèles d'IA (les LLM utilisés sont fournis par tiers et ne sont pas entraînés sur les données Client)
- Vendre ou louer les Données à des tiers
- Faire de la publicité ciblée

### 6.3 Propriété de la Plateforme
ZARYA conserve tous les droits sur la Plateforme : code source, design, marques, logos, documentation, contenus standard (templates ZARYA).

### 6.4 Templates et personnalisations
Les templates personnalisés créés par le Client (modèles d'emails, checklists) restent la propriété du Client.

## Article 7 — Obligations du Client

### 7.1 Conformité légale
Le Client s'engage à utiliser ZARYA dans le respect de toute loi applicable, notamment :
- nLPD et RGPD pour la protection des données personnelles
- Secret professionnel fiduciaire
- Obligations comptables, fiscales, et salariales suisses

### 7.2 Sécurité du compte
Le Client est responsable de :
- La confidentialité de ses identifiants
- L'usage fait par ses Utilisateurs (membres du cabinet)
- La désactivation des comptes en cas de départ d'un collaborateur
- L'activation recommandée de la 2FA

### 7.3 Données importées
Le Client garantit qu'il dispose des droits nécessaires pour importer des Données dans ZARYA, et qu'il a obtenu les consentements requis de ses propres clients (PME).

### 7.4 Usage approprié
Le Client s'interdit notamment :
- Toute utilisation contraire aux lois en vigueur
- Toute tentative d'accéder aux Données d'autres tenants
- Toute action visant à dégrader la sécurité ou la disponibilité du Service
- Le reverse engineering, la copie ou la revente du Service
- L'utilisation du Service pour développer un produit concurrent

## Article 8 — Obligations de ZARYA

### 8.1 Sécurité
ZARYA met en œuvre les mesures techniques et organisationnelles appropriées telles que décrites dans [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md).

### 8.2 Confidentialité
ZARYA s'engage à une stricte confidentialité concernant les Données. L'équipe ZARYA a un accès aux Données limité au strict nécessaire pour le support, avec audit complet.

### 8.3 Conformité
ZARYA s'engage à respecter nLPD et RGPD en qualité de sous-traitant des données.

### 8.4 Support
- **Starter** : email standard, réponse < 48h ouvrées
- **Pro** : email prioritaire, réponse < 24h ouvrées
- **Enterprise** : SLA contractuel, account manager dédié

### 8.5 Sauvegardes
ZARYA effectue des sauvegardes quotidiennes chiffrées avec rétention 7 jours (Starter) à 30 jours (Pro/Enterprise).

## Article 9 — Protection des données personnelles

### 9.1 Qualifications
- ZARYA est **sous-traitant** des Données Personnelles que le Client lui confie
- Le Client est **responsable du traitement** vis-à-vis de ses propres clients et salariés
- Pour les données des membres du cabinet, ZARYA peut être qualifiée de responsable de traitement conjoint, à préciser

### 9.2 DPA
Un **Contrat de Sous-Traitance** (DPA) distinct des présentes CGU régit les obligations de ZARYA en tant que sous-traitant. Voir [`dpa-template.md`](./dpa-template.md).

### 9.3 Sous-traitants ultérieurs
ZARYA recourt à des sous-traitants ultérieurs (AWS pour l'infra, Infomaniak pour l'IA, etc.) listés dans [`sous-traitants.md`](./sous-traitants.md). Le Client est réputé les avoir autorisés par l'acceptation des présentes.

ZARYA notifiera le Client de l'ajout d'un nouveau sous-traitant **30 jours avant** son intégration effective. Le Client peut s'y opposer dans ce délai en résiliant le contrat.

### 9.4 Localisation
Toutes les Données restent en **UE** (Frankfurt principalement). L'option Suisse stricte (Phase 2) est disponible pour le plan Enterprise.

### 9.5 Durée de conservation
À la résiliation, ZARYA conserve les Données pendant **90 jours** pour permettre une éventuelle reprise, puis procède à leur suppression (sauf obligations légales de conservation comptable).

## Article 10 — Responsabilité

### 10.1 Limitation de responsabilité
Dans les limites permises par le droit suisse, la responsabilité de ZARYA est limitée :
- Aux dommages directs prévisibles
- Au montant cumulé des sommes effectivement versées par le Client à ZARYA au cours des **12 mois** précédant le fait générateur

ZARYA n'est pas responsable des dommages indirects, perte de chiffre d'affaires, perte de clientèle, perte de réputation.

### 10.2 Force majeure
ZARYA n'est pas responsable en cas de force majeure incluant : catastrophes naturelles, guerres, pandémies, défaillances majeures de fournisseurs tiers (AWS, Microsoft) sans alternative immédiate.

### 10.3 Données du Client
Le Client est responsable de la qualité, l'exactitude, et la licéité des Données qu'il importe ou crée dans ZARYA. ZARYA ne valide pas le contenu métier des Données.

### 10.4 Conséquences des décisions assistées par IA
Les propositions de l'IA (classifications, extractions, suggestions) doivent toujours être **validées par un humain** avant exploitation finale. ZARYA n'est pas responsable des conséquences de décisions prises sans validation humaine.

## Article 11 — Confidentialité

Les présentes CGU, les conditions commerciales spécifiques, et toute information échangée dans le cadre de la relation contractuelle sont confidentielles.

## Article 12 — Durée et résiliation

### 12.1 Durée
Le contrat est conclu pour une durée correspondant à la période d'abonnement souscrite (mensuelle ou annuelle), avec renouvellement automatique.

### 12.2 Résiliation par le Client
Le Client peut résilier à tout moment depuis l'interface ZARYA, avec effet à la fin de la période en cours. Aucun remboursement au prorata.

### 12.3 Résiliation par ZARYA
ZARYA peut résilier en cas de :
- Manquement grave du Client (paiement, usage frauduleux, atteinte à la sécurité)
- Avec préavis de **60 jours** pour convenance

### 12.4 Conséquences
À la résiliation :
- Suspension de l'accès en fin de période
- Export des Données possible pendant **90 jours**
- Suppression des Données après 90 jours (sauf obligations légales)
- Logs d'audit conservés selon la politique (6 ans minimum)

## Article 13 — Modification des CGU

ZARYA peut modifier les présentes CGU. Les modifications sont notifiées avec un préavis de **30 jours**. Le Client peut résilier sans frais durant ce préavis en cas de désaccord.

## Article 14 — Droit applicable et juridiction

### 14.1 Droit applicable
Les présentes CGU sont régies par le **droit suisse**.

### 14.2 Juridiction compétente
Tout litige sera soumis à la juridiction exclusive des **tribunaux de Genève, Suisse**.

### 14.3 Médiation
Les parties s'engagent à tenter une médiation avant tout recours judiciaire.

## Article 15 — Dispositions diverses

### 15.1 Intégralité
Les CGU, le DPA, la Politique de Confidentialité, et la grille tarifaire constituent l'intégralité de l'accord entre les parties.

### 15.2 Non-renonciation
Le fait de ne pas exercer un droit ne constitue pas une renonciation à ce droit.

### 15.3 Divisibilité
Si une clause est invalide, les autres clauses restent en vigueur.

### 15.4 Cession
ZARYA peut céder son contrat dans le cadre d'une opération de fusion-acquisition, sous réserve d'information du Client.

## Article 16 — Contact

📧 **legal@zarya.ch** (ou contact@zarya.ch initialement)
📮 ZARYA SA — [Adresse], Genève, Suisse

---

⚠️ **Note interne** : ces CGU sont une **base de travail rédigée en interne**. Validation impérative par un juriste suisse spécialisé en droit du numérique et droit commercial avant utilisation contractuelle.

Points à valider avec le juriste :
- Forme juridique ZARYA (SA, Sàrl ?)
- Limitation de responsabilité (montant et durée — à ajuster selon assurance)
- Clauses spécifiques au secret professionnel fiduciaire suisse
- Compatibilité avec les obligations OBLF (lutte contre le blanchiment)
- Articulation avec le DPA (sous-traitance)
- Conditions de résiliation et indemnités
- Mention obligatoire OFL si SaaS B2B
- Conformité avec OAS (ordonnance sur l'archivage)
- **Pack de déploiement initial (article 5.2)** :
  - Qualification juridique (prestation de services distincte de l'abonnement SaaS ?)
  - Conséquences fiscales (TVA, classification comptable)
  - Conditions de remboursement et garantie satisfaction
  - Articulation avec le droit suisse du mandat (CO art. 394+)
  - Mention dans les conditions de résiliation : que se passe-t-il avec un pack payé non encore livré ?
