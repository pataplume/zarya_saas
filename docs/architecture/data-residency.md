---
status: draft
owner: tristan
last_updated: 2026-05-26
domain: architecture
depends_on: []
referenced_by: [llm-strategy, security-and-audit]
---

# Résidence des données — Politique et architecture

## 1. Principe directeur

**Toutes les données ZARYA — au repos, en transit, en traitement — restent en Union Européenne.**

Cible commerciale (cabinets fiduciaires suisses) acceptée par défaut : **Allemagne (Frankfurt) ou France (Paris)**, qui bénéficient d'une **décision d'adéquation** par le Conseil fédéral suisse pour les transferts de données depuis la Suisse.

Pour les cabinets exigeant une résidence **physiquement en Suisse**, une option Phase 2 est prévue (Azure Switzerland North).

## 2. Cartographie des données

### 2.1 Données structurées (Postgres)

| Type de donnée | Stockage | Région | Provider |
|---|---|---|---|
| CRM (clients, contacts, services) | Postgres | Zurich | Supabase eu-central-2 |
| Salaire (employés, périodes, éléments paie) | Postgres | Zurich | Supabase eu-central-2 |
| Factures (extraites, anomalies) | Postgres | Zurich | Supabase eu-central-2 |
| Échéances et relances | Postgres | Zurich | Supabase eu-central-2 |
| Audit logs | Postgres + CloudWatch | Zurich / Frankfurt | Supabase + AWS |
| Comptes auth (clients, fiduciaires) | Supabase Auth | Zurich | Supabase eu-central-2 |

### 2.2 Données non structurées (fichiers binaires)

| Type | Stockage | Région | Provider |
|---|---|---|---|
| Documents uploadés (PDF, Excel, images) | Object storage | Zurich | Supabase Storage (sur S3 eu-central-2) |
| Documents générés (exports CSV, fiches PDF) | Object storage | Zurich | Idem |
| Fichiers sources d'onboarding | Object storage | Zurich | Idem |
| Embeddings (Search) | pgvector | Zurich | Supabase eu-central-2 |

### 2.3 Traitements externes (LLM et OCR)

| Traitement | Service | Région | Conformité |
|---|---|---|---|
| Toute inférence LLM | Infomaniak AI Services | Suisse | nLPD/RGPD natif, DPA Infomaniak |
| OCR de documents scannés | Infomaniak vision (catégorie `vision`) — différé Phase 4.1+ | Suisse | nLPD/RGPD natif, sous-traitant suisse |
| Email (Microsoft Graph) | Microsoft 365 | Tenant client (souvent EU) | À vérifier client par client |
| Recherche Zefix | API Zefix | Suisse | Données publiques, consentement utilisateur |

### 2.4 Compute et hébergement

| Composant | Région | Provider |
|---|---|---|
| Frontend Next.js | Frankfurt | Vercel eu-central-1 (Frankfurt) |
| Backend API | Frankfurt | Vercel ou ECS eu-central-1 |
| Jobs cron / workers | Frankfurt | Supabase Edge Functions ou AWS Lambda eu-central-1 |
| Monitoring (Sentry, etc.) | EU | Provider EU obligatoire |

### 2.5 Données qui peuvent légalement transiter ailleurs

**Aucune** au MVP. Pas d'exception.

Exemples à éviter :
- Sentry SaaS US ❌ → utiliser Sentry self-hosted EU ou GlitchTip
- LogRocket / FullStory US ❌ → pas d'enregistrement de sessions de toute façon
- Google Analytics ❌ → analytics self-hosted (Plausible EU, Umami)
- Mixpanel US ❌ → PostHog Cloud EU ou self-hosted

## 3. Cadre légal

### 3.1 RGPD (Règlement européen 2016/679)
S'applique aux données de **résidents UE**. Tous les choix d'infrastructure respectent :
- Article 5 : minimisation, limitation des finalités
- Article 28 : sous-traitance encadrée par DPA
- Article 32 : sécurité technique et organisationnelle
- Article 44+ : transferts hors UE (aucun chez ZARYA)

### 3.2 nLPD suisse (en vigueur depuis 01.09.2023)
S'applique aux données de **résidents suisses**. La nLPD est largement alignée sur le RGPD, avec quelques spécificités :
- Notion de **profilage à risque élevé** plus large
- **Annonce des violations** au PFPDT (Préposé fédéral) sous 72h
- **Conseil d'État fédéral** publie la liste des pays adéquats : Allemagne et France y figurent

### 3.3 Secret fiscal (Art. 320 CP)
Spécifique au métier de fiduciaire. Les données des clients (déclarations, comptabilité, salaires) sont couvertes. Implications pour ZARYA :
- Sous-traitance autorisée si **mandat écrit** et **obligation de confidentialité contractuelle**
- Les sous-traitants IA (Infomaniak) doivent être contractuellement liés
- Le cabinet fiduciaire reste **responsable** vis-à-vis de ses clients

### 3.4 Spécificités salariales
Les données salariales nominatives sont **catégorie sensible** au sens de la nLPD :
- Consentement explicite des employés requis (responsabilité du client final, pas de ZARYA)
- Chiffrement renforcé recommandé
- Durée de conservation : 10 ans (CO art. 958f)
- Suppression sur demande dans les limites légales

## 4. Chaîne contractuelle des DPA

```
   Client final (PME)
        │
        │ DPA / contrat de travail
        ▼
   Cabinet fiduciaire (Responsable de traitement)
        │
        │ DPA bilatéral (ZARYA modèle fourni)
        ▼
   ZARYA (Sous-traitant)
        │
        ├──── DPA standard ───→ Infomaniak (sous-traitant IA suisse)
        │
        ├──── DPA standard ───→ Supabase
        │
        └──── DPA standard ───→ Vercel
```

### 4.1 DPA à signer avant la 1re vente
- [ ] Infomaniak AI Services DPA (sous-traitant IA suisse)
- [ ] Supabase DPA (offre Pro+)
- [ ] Vercel DPA (offre Pro+)
- [ ] Microsoft 365 (data residency commitment) — vérifié par cabinet

### 4.2 DPA ZARYA → Cabinet fiduciaire
Modèle fourni par ZARYA, à signer à l'onboarding de chaque cabinet :
- Liste des sous-traitants
- Mesures de sécurité techniques
- Engagements de notification
- Droits d'audit
- Conditions de fin de contrat (restitution / suppression des données)

### 4.3 DPA Cabinet → Client final
ZARYA fournit un **modèle de clause** que le cabinet inclut dans ses contrats clients :
- Mention de ZARYA comme outil utilisé
- Liste des sous-traitants ultérieurs (Infomaniak pour l'IA)
- Consentement au traitement automatisé par IA
- Droits du client (accès, rectification, suppression)

## 5. Mesures techniques

### 5.1 Chiffrement
| Niveau | Méthode |
|---|---|
| En transit | TLS 1.3 obligatoire, HTTPS only |
| Au repos (DB) | Postgres + Supabase encryption at rest avec KMS |
| Au repos (fichiers) | S3 SSE-KMS avec CMK ZARYA |
| Champs sensibles (AVS, IBAN) | Chiffrement applicatif **additionnel** via Supabase Vault ou pgcrypto |
| Backups | Chiffrés avec clés distinctes |

### 5.2 Accès et IAM
- Pas d'accès direct DB en production (tout passe par l'app)
- Comptes dev avec MFA obligatoire
- Rotation des credentials trimestrielle
- Logs d'accès admin conservés 6 ans

### 5.3 Isolation multi-tenant
- RLS Postgres scoped par `cabinet_id` (Phase 2) et `client_id`
- Aucun cross-tenant join possible
- Tests automatisés de fuite de données entre tenants

### 5.4 Suppression
- Soft delete d'abord (`archived_at`)
- Hard delete après période légale écoulée
- Suppression vérifiable (export d'attestation pour le client)
- Backups effacés selon politique de rotation (30 jours)

## 6. Hors-scope (à arbitrer plus tard)

### 6.1 Option "Suisse stricte" (Phase 2-3)
Pour les cabinets refusant Frankfurt :
- **Azure Switzerland North** (Zurich) avec Azure AI Foundry pour Claude
- OU **Infomaniak Cloud Souverain** (Genève) avec self-hosted Postgres + Llama local
- Mais : qualité LLM dégradée, coûts plus élevés, complexité opérationnelle

Décision : **proposer en option payante** si la demande commerciale émerge. Pas dans le MVP.

### 6.2 Données analytics anonymisées
À terme, ZARYA pourrait utiliser des données anonymisées (statistiques agrégées) pour améliorer le produit. Ce traitement secondaire doit être :
- Explicitement consenti par le cabinet
- Vraiment anonyme (k-anonymity, pas juste pseudonymisé)
- Documenté dans une notice de confidentialité distincte

### 6.3 Données pour entraînement LLM
**Interdit** au MVP. Aucune donnée ZARYA n'est utilisée pour entraîner des modèles. Infomaniak s'engage contractuellement à ne pas le faire côté IA.

Si un jour ZARYA veut entraîner un modèle propriétaire, il faudra :
- Anonymisation stricte
- Consentement opt-in cabinet par cabinet
- Stockage et entraînement en EU uniquement

## 7. Notification de violations

### 7.1 Détection
- CloudTrail + Supabase audit logs surveillés
- Alertes sur anomalies (accès en masse, suppression suspecte, etc.)
- Tests d'intrusion annuels (Phase 2)

### 7.2 Notification
En cas de violation avérée :
- Sous **72h** à PFPDT (autorité suisse) et CNIL si données françaises
- Sous **72h** aux cabinets fiduciaires affectés
- Sous délai raisonnable aux personnes concernées si risque élevé
- Documentation complète : nature, ampleur, mesures prises

## 8. Droits des personnes

### 8.1 Droits applicables
- Accès : copie des données détenues
- Rectification : correction des inexactitudes
- Effacement : "droit à l'oubli" dans les limites légales
- Portabilité : export structuré (CSV, JSON)
- Opposition : refus du traitement

### 8.2 Procédure
Le **cabinet fiduciaire** est le **point de contact** légal pour ses clients. ZARYA fournit au cabinet :
- Outils d'export par client (1-clic)
- Procédure de suppression vérifiable
- Logs d'accès consultables
- Réponse aux demandes sous 1 mois maximum

## 9. Revue périodique

Ce document est **revu tous les 6 mois** au minimum, et à chaque :
- Ajout d'un sous-traitant
- Changement de région
- Évolution réglementaire significative (jurisprudence, décision PFPDT)
- Audit interne ou externe

Versions historiques conservées en Git.

## 10. Questions ouvertes

- [ ] Pour Microsoft 365 (emails), la résidence dépend du tenant client. Comment vérifier à l'onboarding ? Refuser les clients hors EU ?
- [ ] Sentry self-hosted EU vs GlitchTip vs ne rien faire au MVP ?
- [ ] Politique d'archivage long terme (> 10 ans) après fin de mandat ?
- [ ] Si un cabinet exige absolument Switzerland North, est-ce qu'on le sert avec une infrastructure dédiée ou on refuse ?
- [ ] Audit externe annuel (ISO 27001 ?) à partir de quel volume de clients ?
