---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: compliance
public: true
depends_on: [registre-traitements, sous-traitants, security-and-audit]
referenced_by: [cgu, _index]
---

# Politique de confidentialité ZARYA

> Document destiné à être **publié publiquement** sur le site web ZARYA. Rédigé en langage clair et accessible. À adapter / valider par un juriste avant mise en ligne.

> **Dernière mise à jour** : [À compléter à la publication]
> **Version** : 1.0

## En résumé

- ZARYA traite des données personnelles dans le cadre de la prestation d'un service SaaS aux cabinets fiduciaires suisses
- Vos données au repos sont stockées en **Suisse** (Zurich) ; l'hébergement applicatif est en **Union Européenne** (Frankfurt, Allemagne)
- Nous ne vendons **jamais** vos données et ne les utilisons pas pour de la publicité
- Vous pouvez exercer vos droits à tout moment via dpo@zarya.ch
- Nous respectons strictement la **nLPD suisse** et le **RGPD européen**

## 1. Qui sommes-nous ?

**ZARYA SA** (à créer)
[Adresse du siège]
[Genève, Suisse]
IDE : [À compléter]

**Responsable du traitement** : ZARYA SA
**Contact** : dpo@zarya.ch (ou contact@zarya.ch en attendant)

Si vous êtes un utilisateur d'un cabinet fiduciaire client de ZARYA, sachez que **votre cabinet est le responsable principal** du traitement de vos données personnelles. ZARYA agit en tant que **sous-traitant** pour le compte du cabinet.

## 2. Quelles données collectons-nous ?

### Si vous êtes un membre d'un cabinet fiduciaire
- Identifiants de connexion (email, mot de passe haché)
- Identité professionnelle (nom, prénom, fonction)
- Coordonnées (email professionnel, téléphone)
- Préférences (langue, fuseau horaire)
- Logs d'activité (connexions, actions effectuées)

### Si vous êtes un contact d'un client PME
- Identité (nom, prénom, fonction)
- Coordonnées professionnelles (email, téléphone)
- Informations sur votre relation avec le client (rôle RH, contact comptable, dirigeant)

### Si vous êtes un salarié d'une PME cliente
ZARYA traite les données suivantes pour le compte de votre employeur et de son cabinet fiduciaire :
- Identité civile (nom, prénom, date de naissance, état civil, sexe)
- Identifiant national (numéro AVS)
- Coordonnées bancaires (IBAN)
- Données contractuelles (salaire, fonction, date d'entrée, taux d'activité)
- Données de paie mensuelles (heures, primes, déductions, absences)
- Certificats médicaux (catégorie sensible, traitement renforcé)

### Données collectées via votre navigation
- Adresse IP
- Type de navigateur
- Pages consultées
- Durée des sessions
- Cookies techniques nécessaires au fonctionnement

## 3. Pourquoi collectons-nous ces données ?

### Pour fournir le service
Permettre au cabinet fiduciaire de gérer ses clients, ses échéances, ses documents, ses factures et ses cycles de paie. C'est l'objet du contrat.

### Pour la sécurité et l'audit
Détecter les anomalies, prévenir la fraude (notamment la fraude au RIB), tracer les actions pour conformité.

### Pour l'amélioration du service
Comprendre comment ZARYA est utilisé pour l'améliorer (statistiques anonymisées).

### Pour vous communiquer
Vous informer des évolutions du service, vous envoyer des notifications opérationnelles (relances, validations).

## 4. Base légale du traitement

Selon la donnée et la finalité :
- **Exécution du contrat** : pour la majorité des traitements (compte utilisateur, données salariales, documents)
- **Obligation légale** : pour la conservation comptable et fiscale (10 ans)
- **Consentement** : pour les communications marketing
- **Intérêt légitime** : pour la sécurité, l'audit, et l'amélioration du service

## 5. Avec qui partageons-nous vos données ?

ZARYA partage vos données avec **un nombre limité de sous-traitants techniques**, tous situés en Suisse (pays reconnu adéquat par l'UE) ou en UE :

| Sous-traitant | Rôle | Localisation |
|---|---|---|
| Amazon Web Services | Hébergement infrastructure (sous-jacent à Supabase) | Zurich, Suisse |
| Supabase | Base de données et stockage | Zurich, Suisse |
| Infomaniak AI Services | Intelligence artificielle (analyse de documents) | Suisse |
| Vercel | Hébergement de l'application web (compute) | Frankfurt, Allemagne (UE) |
| Microsoft | Intégration Outlook (si vous utilisez Microsoft 365) | Selon votre tenant |
| Stripe | Paiement des abonnements cabinets | UE |
| Sentry | Détection des erreurs techniques | UE |
| PostHog | Analytics produit (cloud EU) | UE |

**Aucun de ces sous-traitants n'a le droit d'utiliser vos données pour leurs propres finalités.** Tous ont signé un contrat de sous-traitance (DPA) avec ZARYA.

**ZARYA ne vend jamais vos données. ZARYA ne fait pas de publicité. ZARYA n'utilise pas vos données pour entraîner des modèles d'IA.**

## 6. Où vos données sont-elles stockées ?

Vos données au repos (base de données, fichiers, sauvegardes) sont stockées **en Suisse** (Zurich), via Supabase sur l'infrastructure AWS eu-central-2. L'hébergement applicatif (le traitement par l'application web et les tâches planifiées) est réalisé **en Union Européenne** (Frankfurt, Allemagne, via Vercel). L'analyse par intelligence artificielle est réalisée **en Suisse** (Infomaniak), le temps du traitement uniquement, sans stockage durable.

La Suisse est reconnue par la Commission européenne comme un **pays tiers offrant un niveau de protection adéquat** (RGPD art. 45).

**Aucune donnée n'est transférée aux États-Unis ou vers d'autres pays sans niveau de protection équivalent.**

## 7. Combien de temps conservons-nous vos données ?

| Type de données | Durée de conservation |
|---|---|
| Compte utilisateur actif | Durée du contrat |
| Compte utilisateur supprimé | Anonymisation immédiate (logs d'audit conservés 6 ans) |
| Données salariales | 10 ans après fin de contrat (obligation suisse) |
| Documents comptables | 10 ans (obligation suisse) |
| Logs d'audit | 6 ans (obligation fiduciaire) |
| Tickets de support | 2 ans |
| Données marketing (prospects) | 3 ans après dernier engagement ou jusqu'à désinscription |

## 8. Comment vos données sont-elles protégées ?

ZARYA met en œuvre des mesures techniques et organisationnelles strictes :

- **Chiffrement** des données en transit (TLS 1.3) et au repos (AES-256)
- **Chiffrement applicatif renforcé** pour les données ultra-sensibles (numéros AVS, IBAN, mots de passe)
- **Isolation stricte multi-tenant** : aucun cabinet ne peut voir les données d'un autre
- **Audit complet** : toutes les actions sensibles sont tracées
- **Authentification forte** recommandée (2FA)
- **Sauvegardes quotidiennes chiffrées**
- **Tests de sécurité réguliers** (penetration tests à partir de Phase 2)
- **Politique de réponse aux incidents** (notification dans les 72h)

Pour le détail technique, voir notre [documentation sécurité](https://docs.zarya.ch/security).

## 9. Vos droits

Conformément à la nLPD et au RGPD, vous disposez des droits suivants :

### Droit d'accès
Vous pouvez demander une copie de toutes vos données personnelles traitées par ZARYA.

### Droit de rectification
Vous pouvez demander la correction de données inexactes ou incomplètes.

### Droit d'effacement
Vous pouvez demander la suppression de vos données, sous réserve des obligations légales de conservation (notamment fiscale).

### Droit à la limitation du traitement
Vous pouvez demander que vos données ne soient plus traitées dans certains cas (litige en cours, contestation de l'exactitude).

### Droit à la portabilité
Vous pouvez demander à recevoir vos données dans un format structuré et exploitable pour les transférer à un autre prestataire.

### Droit d'opposition
Vous pouvez vous opposer au traitement de vos données pour les finalités marketing.

### Comment exercer ces droits
Contactez-nous à **dpo@zarya.ch**. Nous répondons dans un délai maximum de **30 jours**.

Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès du **PFPDT** (Préposé Fédéral à la Protection des Données et à la Transparence, Suisse) ou de l'autorité de protection des données compétente dans votre pays de résidence (CNIL en France, BfDI en Allemagne, etc.).

## 10. Vos données et l'intelligence artificielle

ZARYA utilise l'intelligence artificielle pour vous aider à classer des documents, extraire des informations, et répondre à des questions sur vos données.

### Comment ça fonctionne
- Les modèles d'IA, **fournis par Infomaniak (société suisse)**, **ne sont pas entraînés sur vos données**
- Vos données sont envoyées au modèle uniquement le temps du traitement (pas de stockage long terme côté Infomaniak)
- L'inférence IA s'exécute **en Suisse** : vos documents ne quittent jamais la Suisse pour être analysés
- Vous pouvez voir les sources de chaque réponse IA (transparence)

### Vos garanties
- Aucune décision automatisée sans validation humaine pour les sujets sensibles
- Vous pouvez toujours corriger une proposition de l'IA
- Toutes les invocations de l'IA sont tracées dans nos logs (à votre demande)

## 11. Cookies et technologies similaires

ZARYA utilise un minimum de cookies, tous techniques :
- **Cookie d'authentification** : nécessaire pour vous connecter
- **Cookie de session** : nécessaire pour maintenir votre session
- **Cookie de préférences** : langue, fuseau horaire

Pas de cookies publicitaires. Pas de cookies de profilage. Pas de tracker tiers (Google Analytics, Facebook Pixel, etc.).

Pour les analyses produit, nous utilisons PostHog (cloud EU) avec un mode privacy-friendly (anonymisation IP, pas de tracking cross-site).

## 12. Modifications de cette politique

Nous pouvons mettre à jour cette politique de confidentialité. La date de dernière mise à jour est indiquée en haut de cette page.

Pour les modifications **significatives**, nous vous informerons par email au moins **30 jours avant** leur entrée en vigueur.

## 13. Notification de violation de données

En cas de violation de données susceptible de présenter un risque pour vos droits et libertés, ZARYA s'engage à :
- Notifier le PFPDT (Suisse) et/ou la CNIL (UE) dans les **72 heures**
- Vous notifier directement si la violation présente un risque élevé pour vous
- Vous communiquer les mesures prises pour limiter les conséquences

## 14. Contact

**Pour toute question relative à cette politique** :

📧 **dpo@zarya.ch** (ou contact@zarya.ch initialement)
📮 ZARYA SA
[Adresse à compléter]
[Genève, Suisse]

**Pour exercer vos droits** : dpo@zarya.ch

**Pour signaler un incident de sécurité** : security@zarya.ch

## 15. Cadres légaux applicables

Cette politique respecte :
- 🇨🇭 **nLPD** (Loi fédérale sur la protection des données, Suisse, version 2023)
- 🇪🇺 **RGPD** (Règlement général sur la protection des données, UE, 2018)
- 🇨🇭 **Code des obligations** (Suisse) pour les obligations de conservation
- 🇨🇭 **Secret professionnel fiduciaire** par extension contractuelle

---

⚠️ **Note interne** : cette politique a été rédigée en interne pour servir de base de discussion. **Validation par un juriste suisse spécialisé** obligatoire avant publication. Plusieurs points à confirmer :
- Forme juridique ZARYA SA (à incorporer)
- Adresse exacte et IDE
- Politique cookies exacte selon implémentation finale
- Mention du représentant UE si applicable
- Conformité ePrivacy si emails marketing
- Vérification des sous-traitants à jour

À tester : compréhension par un utilisateur lambda (Aïcha, contact RH PME) — le document doit être lisible sans formation juridique.
