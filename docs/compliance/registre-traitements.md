---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: compliance
depends_on: [security-and-audit, data-residency, multi-tenant]
referenced_by: [_index, politique-confidentialite, droits-personnes]
---

# Registre des traitements de données

> Inventaire formel de tous les traitements de données personnelles effectués par ZARYA. **Obligatoire RGPD article 30 et recommandé nLPD article 12**.
>
> Document à maintenir à jour à chaque évolution produit. Référence pour les audits, les demandes d'exercice de droits, et les DPA.

## 1. Identification du responsable de traitement

**Responsable de traitement** :
- Raison sociale : ZARYA SA (à créer)
- Adresse : [à compléter au moment de l'incorporation]
- IDE : [à compléter]
- Contact DPO : dpo@zarya.ch (ou support@zarya.ch initialement)
- Représentant UE (si applicable) : [à désigner si > 250 employés OU traitements à risque massif]

**Contact pour exercice des droits** : dpo@zarya.ch

## 2. Liste des traitements

### Traitement 1 — Gestion des comptes utilisateurs cabinet

| Élément | Description |
|---|---|
| **Finalité** | Permettre aux membres d'un cabinet fiduciaire d'accéder à ZARYA |
| **Base légale** | Exécution du contrat (RGPD art. 6.1.b) |
| **Catégories de personnes concernées** | Membres des cabinets clients (responsables, gestionnaires, collaborateurs) |
| **Catégories de données** | Nom, prénom, email, téléphone professionnel, rôle, mot de passe haché, langue, fuseau horaire |
| **Destinataires** | Équipe ZARYA (support, ops, dev) avec audit log |
| **Sous-traitants** | Supabase (auth), AWS (infra), Sentry (logs), PostHog (analytics) |
| **Transfert hors UE** | Non |
| **Durée de conservation** | Durée du contrat + 3 ans après résiliation |
| **Mesures de sécurité** | Chiffrement at-rest et in-transit, RLS multi-tenant, 2FA (recommandée), audit complet |

### Traitement 2 — Gestion des contacts clients PME

| Élément | Description |
|---|---|
| **Finalité** | Permettre au cabinet de gérer les contacts de ses clients PME (RH, dirigeants) |
| **Base légale** | Exécution du contrat avec le cabinet (RGPD art. 6.1.b) + intérêt légitime du cabinet pour sa propre gestion |
| **Catégories de personnes concernées** | Contacts professionnels des clients PME (RH, dirigeants, comptabilité) |
| **Catégories de données** | Nom, prénom, email, téléphone, fonction, langue, lien avec le client |
| **Destinataires** | Cabinet (rôle = sous-traitant ZARYA pour le cabinet) |
| **Sous-traitants** | Supabase, AWS, Microsoft (envoi d'emails) |
| **Transfert hors UE** | Non |
| **Durée de conservation** | Durée de la relation avec le client + 10 ans (obligation fiscale CH) |
| **Mesures de sécurité** | RLS, chiffrement, audit |

### Traitement 3 — Gestion des données salariales d'employés

| Élément | Description |
|---|---|
| **Finalité** | Permettre au cabinet de gérer la paie de ses clients PME |
| **Base légale** | Exécution du contrat avec le cabinet (qui agit comme sous-traitant de l'employeur PME) |
| **Catégories de personnes concernées** | Salariés des PME clientes (incluant ressortissants UE frontaliers) |
| **Catégories de données** | Nom, prénom, date de naissance, sexe, état civil, AVS, IBAN, adresse, salaire de base, primes, déductions, absences, heures travaillées, certificats médicaux (sensible) |
| **Données sensibles** | Données de santé (certificats d'arrêt maladie) → consentement explicite + mesures renforcées |
| **Destinataires** | Cabinet, logiciel de paie cible (Bexio, Crésus, etc.), AVS, LPP, IS, ESTV (transmissions légales) |
| **Sous-traitants** | Supabase, AWS (infra Supabase), Infomaniak AI Services (Suisse — extraction IA) |
| **Transfert hors UE** | Non |
| **Durée de conservation** | 10 ans après fin de contrat de l'employé (obligation CH) |
| **Mesures de sécurité** | Chiffrement applicatif (Vault), RLS double (cabinet + client), accès limité aux rôles autorisés, audit complet |

### Traitement 4 — Gestion des documents documentaires et factures

| Élément | Description |
|---|---|
| **Finalité** | Centraliser, classer et exploiter les documents reçus par le cabinet pour le compte de ses clients |
| **Base légale** | Exécution du contrat |
| **Catégories de personnes concernées** | Toute personne mentionnée dans les documents (clients, fournisseurs, prestataires, salariés) |
| **Catégories de données** | Noms, identifiants entreprises, IBAN, montants, contenus textuels divers |
| **Destinataires** | Cabinet, sous-traitants techniques |
| **Sous-traitants** | Supabase Storage, AWS (infra Supabase), Infomaniak AI Services (Suisse — classification IA, extraction), NAS du cabinet |
| **Transfert hors UE** | Non (Infomaniak = Suisse, pays adéquat) |
| **Durée de conservation** | 10 ans (obligation fiscale CH) puis purge ou archivage froid |
| **Mesures de sécurité** | Chiffrement at-rest et in-transit, déduplication par hash, RLS, audit complet |

### Traitement 5 — Recherche et IA générative

| Élément | Description |
|---|---|
| **Finalité** | Permettre aux utilisateurs de poser des questions en langage naturel sur leurs données |
| **Base légale** | Exécution du contrat |
| **Catégories de personnes concernées** | Toute personne dont les données sont indexées |
| **Catégories de données** | Toutes les catégories ci-dessus, sous forme d'embeddings vectoriels + chunks textuels |
| **Destinataires** | Utilisateurs du cabinet authentifiés |
| **Sous-traitants** | Supabase pgvector, AWS (infra Supabase), Infomaniak AI Services (Suisse — embeddings) |
| **Transfert hors UE** | Non |
| **Durée de conservation** | Idem documents source |
| **Mesures de sécurité** | RLS sur chunks, filtrage applicatif redondant, anti-injection prompt, audit des requêtes |

### Traitement 6 — Communication par email (Microsoft Graph)

| Élément | Description |
|---|---|
| **Finalité** | Envoyer des relances et notifications depuis l'adresse du cabinet, et lire les emails entrants pour ingestion documentaire |
| **Base légale** | Exécution du contrat |
| **Catégories de personnes concernées** | Contacts des clients PME, fournisseurs |
| **Catégories de données** | Emails (expéditeur, destinataire, contenu, pièces jointes) |
| **Destinataires** | Cabinet authentifié |
| **Sous-traitants** | Microsoft Graph (région du tenant Microsoft du cabinet) |
| **Transfert hors UE** | Possible si tenant Microsoft du cabinet hors UE → alerte et action lors de l'onboarding cabinet |
| **Durée de conservation** | 30 jours pour le corps HTML, indéfiniment pour les métadonnées et pièces jointes liées à un document validé |
| **Mesures de sécurité** | OAuth, audit Graph, filtrage des contenus sensibles |

### Traitement 7 — Facturation et paiement abonnement

| Élément | Description |
|---|---|
| **Finalité** | Facturer les cabinets clients de ZARYA |
| **Base légale** | Exécution du contrat |
| **Catégories de personnes concernées** | Responsables financiers des cabinets clients |
| **Catégories de données** | Raison sociale cabinet, adresse, IDE, IBAN ou carte (via Stripe, jamais stockée chez ZARYA) |
| **Destinataires** | Stripe, comptabilité interne ZARYA |
| **Sous-traitants** | Stripe (UE) |
| **Transfert hors UE** | Non (Stripe UE pour cabinets EU/CH) |
| **Durée de conservation** | 10 ans (obligation fiscale) |
| **Mesures de sécurité** | Pas de carte stockée chez ZARYA, tokenisation Stripe |

### Traitement 8 — Audit et journalisation

| Élément | Description |
|---|---|
| **Finalité** | Tracer toutes les actions sensibles pour audit, sécurité, et conformité |
| **Base légale** | Obligation légale (nLPD art. 8 et RGPD art. 32) + intérêt légitime |
| **Catégories de personnes concernées** | Tous les utilisateurs ZARYA |
| **Catégories de données** | User ID, IP, user agent, action effectuée, ressource concernée, timestamp |
| **Destinataires** | Équipe ZARYA (avec audit du support), cabinet pour ses propres logs |
| **Sous-traitants** | Supabase, AWS, Sentry |
| **Transfert hors UE** | Non |
| **Durée de conservation** | 6 ans minimum (obligation fiduciaire) |
| **Mesures de sécurité** | Append-only (pas de DELETE/UPDATE), permissions restrictives, anonymisation des PII dans les logs techniques |

### Traitement 9 — Marketing et communication ZARYA

| Élément | Description |
|---|---|
| **Finalité** | Communiquer avec les prospects et clients sur les nouveautés produit, événements, partenariats |
| **Base légale** | Consentement (prospects) + intérêt légitime (clients existants) |
| **Catégories de personnes concernées** | Prospects et utilisateurs ayant opté pour la newsletter |
| **Catégories de données** | Email, prénom, langue, préférences |
| **Destinataires** | Équipe ZARYA |
| **Sous-traitants** | Outil emailing (à choisir : Resend, Postmark, Mailgun EU) |
| **Transfert hors UE** | Non |
| **Durée de conservation** | Jusqu'à demande de désabonnement ou 3 ans après dernier engagement |
| **Mesures de sécurité** | Opt-in clair, désinscription en 1 clic |

### Traitement 10 — Support utilisateurs

| Élément | Description |
|---|---|
| **Finalité** | Répondre aux demandes de support et résoudre les incidents |
| **Base légale** | Exécution du contrat |
| **Catégories de personnes concernées** | Utilisateurs ayant contacté le support |
| **Catégories de données** | Email, contenu de la demande, captures d'écran éventuelles |
| **Destinataires** | Équipe support ZARYA |
| **Sous-traitants** | Outil de ticketing (à choisir : Plain, Front, ou Linear) |
| **Transfert hors UE** | À vérifier selon outil retenu |
| **Durée de conservation** | 2 ans après clôture du ticket |
| **Mesures de sécurité** | Accès limité équipe support |

## 3. Catégories de données sensibles

ZARYA traite certaines catégories de données particulièrement sensibles qui requièrent des mesures renforcées :

| Catégorie | Source | Mesures |
|---|---|---|
| **Données de santé** (certificats médicaux d'arrêt) | Module Salaire | Chiffrement Vault, accès strict gestionnaire salaires, audit renforcé |
| **Identifiants nationaux** (AVS) | Module Salaire | Chiffrement Vault, validation checksum, audit |
| **Données bancaires** (IBAN) | Multiple modules | Chiffrement Vault, détection fraude IBAN, audit |
| **Salaires nominatifs** | Module Salaire | RLS double, restriction par rôle, audit |
| **Données fiscales personnelles** | Modules Doc, Facture | Conservation longue, accès limité |

## 4. Transferts internationaux de données

ZARYA limite strictement les transferts hors UE/Suisse :

| Sous-traitant | Région | Cadre |
|---|---|---|
| AWS (infrastructure Supabase) | eu-central-1 Frankfurt | UE — pas de transfert |
| Infomaniak AI Services | Suisse | Suisse — pays adéquat (nLPD / RGPD), pas de transfert problématique |
| Microsoft Graph | Région tenant du cabinet | Variable — vérification à l'onboarding, alerte si non-UE |
| Stripe | UE | UE — pas de transfert |
| Vercel | Edge global + compute UE | Compute principal redirigé UE |
| Sentry | UE (région SaaS EU) | UE — pas de transfert |
| Posthog | UE (cloud EU) ou self-hosted | UE |

**Aucun transfert vers les États-Unis ou pays sans niveau adéquat de protection** au sens de la nLPD et du RGPD.

## 5. Durées de conservation détaillées

| Catégorie de donnée | Durée | Base |
|---|---|---|
| Compte utilisateur actif | Durée du contrat | Contrat |
| Compte utilisateur supprimé | Anonymisation immédiate, audit conservé 6 ans | Obligation fiduciaire |
| Données salariales | 10 ans après fin de contrat employé | Code des obligations CH |
| Documents comptables et factures | 10 ans | Loi comptable CH |
| Audit log | 6 ans | Obligation fiduciaire |
| Conversations support | 2 ans | Intérêt légitime |
| Prospects marketing | 3 ans après dernier engagement | Consentement |
| Données de paiement | 10 ans | Obligation fiscale |

## 6. Sécurité — résumé

Toutes les mesures techniques et organisationnelles sont détaillées dans [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md).

Points clés :
- Chiffrement TLS 1.3 in-transit, AES-256 at-rest, Vault pour les champs ultra-sensibles
- RLS Postgres multi-tenant systématique
- Audit log append-only conservé 6 ans
- Tests d'isolation cross-tenant obligatoires en CI
- 2FA recommandée puis obligatoire (Phase 2)
- Pen test annuel à partir de Phase 2
- Backups quotidiens chiffrés, PITR 7 jours

## 7. Droits des personnes — résumé

Procédure complète dans [`droits-personnes.md`](./droits-personnes.md).

Droits couverts :
- Droit d'accès (RGPD art. 15 / nLPD art. 25)
- Droit de rectification (RGPD art. 16 / nLPD art. 32)
- Droit d'effacement (RGPD art. 17 / nLPD art. 32)
- Droit à la limitation du traitement (RGPD art. 18)
- Droit à la portabilité (RGPD art. 20 / nLPD art. 28)
- Droit d'opposition (RGPD art. 21)

Contact : dpo@zarya.ch — réponse sous 30 jours maximum.

## 8. Étude d'impact (PIA)

Pour les traitements à risque élevé, une étude d'impact (Privacy Impact Assessment) est obligatoire (RGPD art. 35, nLPD art. 22).

Traitements identifiés comme à risque chez ZARYA :
- **Traitement 3** (données salariales) : PIA recommandée avant la mise en production complète du module Salaire
- **Traitement 5** (IA générative sur données personnelles) : PIA recommandée

PIA à conduire par un consultant DPO/conformité avant la Phase 2.

## 9. Notification de violation de données

Procédure complète dans [`notification-violation.md`](./notification-violation.md).

- **Délai** : 72h pour notifier le PFPDT (Suisse) et la CNIL (UE)
- **Notification aux personnes concernées** : si risque élevé
- **Documentation interne obligatoire** dans `audit.*`

## 10. Sous-traitance

Tous les sous-traitants identifiés dans [`sous-traitants.md`](./sous-traitants.md).

DPA template dans [`dpa-template.md`](./dpa-template.md).

## 11. Mise à jour de ce registre

Ce registre est **vivant**. Doit être mis à jour :
- À chaque nouveau traitement de données personnelles
- À chaque modification structurante d'un traitement existant (finalité, base légale, catégorie de données, durée de conservation, sous-traitant)
- À chaque audit ou évaluation de conformité
- Au minimum une fois par an

Modifications loggées dans Git avec commit messages explicites.

## 12. Statut juridique

⚠️ Ce document a été rédigé en interne. **Validation par un juriste suisse spécialisé en droit du numérique requise** avant publication ou utilisation comme registre formel de l'art. 30 RGPD / art. 12 nLPD.

Validation prévue : avant signature du premier cabinet payant.
