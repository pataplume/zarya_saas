---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
type: compliance
depends_on: [registre-traitements, data-residency, stack]
referenced_by: [_index, politique-confidentialite, cgu, dpa-template]
---

# Inventaire des sous-traitants ZARYA

> Liste exhaustive des sous-traitants (au sens RGPD art. 28 / nLPD art. 9) intervenant dans le traitement des données personnelles via ZARYA.
>
> À tenir à jour à chaque ajout, modification ou suppression d'un sous-traitant. Diffusion : équipe ZARYA + clients sur demande.

## 1. Vue d'ensemble

ZARYA recourt à 10 sous-traitants principaux, tous situés en UE. Ils sont catégorisés par criticité :

- **Critique** : impact direct sur les données métier (LLM, DB, OCR)
- **Important** : services support (paiement, monitoring)
- **Accessoire** : outils internes (analytics)

## 2. Liste complète

### 2.1 Amazon Web Services (AWS) — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Hébergement infrastructure cloud, Bedrock LLM, S3 (via Supabase Storage) |
| **Région** | eu-central-1 (Frankfurt, Allemagne) |
| **Données traitées** | Toutes les Données du Client (via Supabase et Bedrock) |
| **Sous-sous-traitants** | AWS infrastructure providers (data centers Allemagne) |
| **DPA signé** | À signer avant production — DPA standard AWS disponible |
| **Certifications** | ISO 27001, ISO 27017, ISO 27018, SOC 2, GDPR compliant |
| **Cadre de transfert** | Pas de transfert hors UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://aws.amazon.com/compliance/ |

AWS sous-traitant ZARYA — Setup 27 mai 2026
─────────────────────────────────────────────
Compte AWS         : 344156899985 (Condere)
Région primaire    : eu-central-1 (Frankfurt)
Régions fallback   : eu-west-1, eu-west-3, eu-north-1 (toutes UE)
IAM User           : zarya-bedrock-prod
ARN                : arn:aws:iam::344156899985:user/zarya-bedrock-prod
Policy             : AmazonBedrockFullAccess (durcir Phase 2)
Inference profiles : eu.anthropic.claude-sonnet-4-6
                     eu.anthropic.claude-haiku-4-5-20251001-v1:0
                     eu.anthropic.claude-opus-4-7
Quotas demandés    : 27 mai 2026, 4 demandes (Sonnet/Haiku × TPM/RPM)
Rotation clés      : tous les 12 mois (mai 2027)

### 2.2 Supabase — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Base de données Postgres, Auth, Storage, Realtime, Vault, pgvector |
| **Région** | eu-central-1 (Frankfurt, sur AWS) |
| **Données traitées** | Toutes les Données structurées et fichiers du Client |
| **Sous-sous-traitants** | AWS (infrastructure sous-jacente) |
| **DPA signé** | À signer — DPA standard Supabase disponible |
| **Certifications** | SOC 2 Type II, HIPAA |
| **Cadre de transfert** | Pas de transfert hors UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://supabase.com/legal |

### 2.3 Anthropic (via AWS Bedrock) — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Modèles LLM Claude Sonnet 4.6 et Haiku 4.5 |
| **Région** | eu-central-1 (Frankfurt) via Bedrock |
| **Données traitées** | Contenus envoyés temporairement aux modèles (documents, propositions, questions) |
| **Sous-sous-traitants** | AWS |
| **DPA signé** | Via le DPA AWS — Anthropic est un fournisseur sur Bedrock |
| **Engagement** | AWS Bedrock garantit que les données ne sont pas utilisées pour entraîner les modèles |
| **Rétention** | Logs Bedrock conservés 30 jours côté AWS pour debug |
| **Certifications** | Anthropic : SOC 2 Type II, AWS : multiples |
| **Cadre de transfert** | Pas de transfert hors UE via Bedrock EU |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html |

### 2.4 Mistral AI — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | OCR via Mistral La Plateforme |
| **Région** | eu-west-3 (Paris, France) |
| **Données traitées** | Documents PDF scannés temporairement pendant OCR |
| **Sous-sous-traitants** | Infrastructure cloud française |
| **DPA signé** | À signer — DPA Mistral disponible |
| **Engagement** | Mistral garantit conformité RGPD, pas d'entraînement sur données client |
| **Rétention** | Pas de stockage long terme des documents soumis |
| **Certifications** | En cours d'obtention SOC 2 |
| **Cadre de transfert** | Pas de transfert hors UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://mistral.ai/terms/ |

### 2.5 Microsoft (Graph API) — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Accès aux boîtes Outlook et calendriers Microsoft 365 des cabinets |
| **Région** | **Variable selon le tenant Microsoft du Client** |
| **Données traitées** | Emails (lecture entrante + envoi sortant), événements de calendrier |
| **Sous-sous-traitants** | Microsoft infrastructure |
| **DPA signé** | Pas applicable directement (le Client a son propre contrat avec Microsoft) |
| **Note importante** | ZARYA vérifie à l'onboarding cabinet que le tenant Microsoft est en UE. Si non-UE, alerte au Client. |
| **Certifications** | ISO 27001, ISO 27018, SOC 2 |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://learn.microsoft.com/en-us/compliance/ |

### 2.6 Stripe — Important

| Élément | Valeur |
|---|---|
| **Service rendu** | Paiement des abonnements cabinets |
| **Région** | UE (Stripe Payments Europe) |
| **Données traitées** | Identité de facturation du cabinet, données de paiement (jamais stockées chez ZARYA) |
| **Sous-sous-traitants** | Processeurs bancaires |
| **DPA signé** | DPA Stripe automatique à l'inscription |
| **Certifications** | PCI DSS Level 1, ISO 27001, SOC 1, SOC 2 |
| **Cadre de transfert** | Pas de transfert hors UE pour clients EU |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://stripe.com/legal/dpa |

### 2.7 Vercel — Important

| Élément | Valeur |
|---|---|
| **Service rendu** | Hébergement frontend Next.js et compute Edge |
| **Région** | Edge global (caching) + compute principal redirigé vers eu-central-1 |
| **Données traitées** | Données de session, IP, métadonnées HTTP |
| **Sous-sous-traitants** | AWS, autres CDN |
| **DPA signé** | DPA Vercel disponible |
| **Certifications** | SOC 2 Type II, ISO 27001 |
| **Cadre de transfert** | Edge mondial mais données sensibles redirigées vers UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://vercel.com/legal/dpa |

### 2.8 Sentry — Important

| Élément | Valeur |
|---|---|
| **Service rendu** | Détection et tracking d'erreurs techniques |
| **Région** | UE (Sentry SaaS EU) |
| **Données traitées** | Stack traces, métadonnées techniques, user_id (sans PII grâce au filtrage) |
| **Sous-sous-traitants** | Google Cloud (région EU) |
| **DPA signé** | DPA Sentry disponible |
| **Certifications** | SOC 2 Type II, ISO 27001 |
| **Filtrage** | PII filtrées avant envoi (pino redact, Sentry beforeSend) |
| **Cadre de transfert** | Pas de transfert hors UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://sentry.io/legal/dpa/ |

### 2.9 PostHog — Accessoire

| Élément | Valeur |
|---|---|
| **Service rendu** | Analytics produit (events, funnels) |
| **Région** | UE cloud OU self-hosted (Phase 2) |
| **Données traitées** | Events anonymisés, IDs utilisateurs hashés |
| **Sous-sous-traitants** | AWS EU |
| **DPA signé** | DPA PostHog disponible |
| **Certifications** | SOC 2 Type II |
| **Mode** | Privacy-friendly : anonymisation IP, pas de tracking cross-site |
| **Cadre de transfert** | Pas de transfert hors UE |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://posthog.com/dpa |

### 2.10 Outil emailing transactionnel — À choisir

| Élément | Valeur |
|---|---|
| **Service rendu** | Emails transactionnels (activation compte, notifications) |
| **Région** | UE (selon le fournisseur retenu) |
| **Candidats** | Resend (US mais option EU), Postmark (US/EU), Mailgun (EU), SendGrid (US) |
| **Recommandation** | **Resend** ou **Mailgun EU** pour conformité |
| **Note** | À sélectionner avant production |

## 3. Sous-traitants secondaires (potentiels)

À évaluer au cas par cas :
- Outil de support / ticketing (Plain, Front, Linear)
- Outil de signature électronique (DocuSign EU, Yousign) — Phase 2
- Banque pour intégration open banking — Phase 2-3

## 4. Procédure d'ajout d'un nouveau sous-traitant

### 4.1 Évaluation préalable
1. **Identification du besoin** et alternatives évaluées
2. **Localisation des données** : doit être UE ou pays adéquat
3. **Certifications** : SOC 2 ou ISO 27001 minimum pour les sous-traitants critiques
4. **DPA disponible** : refus si pas de DPA proposé
5. **Réputation et stabilité** : pas de startup early-stage pour les services critiques

### 4.2 Validation interne
- Décision équipe (au moins 2 personnes)
- Documentation dans ce fichier
- Mise à jour `registre-traitements.md`

### 4.3 Notification clients
- Préavis 30 jours avant intégration effective
- Notification via newsletter produit ou email dédié
- Possibilité de résilier pour le Client

### 4.4 Suivi
- Revue annuelle de tous les sous-traitants
- Re-vérification des certifications, DPA, conformité

## 5. Procédure de retrait d'un sous-traitant

### 5.1 Cas de retrait
- Décision business (changement de stack)
- Sous-traitant compromis (incident sécurité majeur)
- Évolution réglementaire incompatible
- Demande du sous-traitant lui-même

### 5.2 Plan de migration
- Identification d'un remplaçant équivalent
- Tests de bascule
- Suppression des données chez l'ancien sous-traitant (vérification)
- Mise à jour de ce fichier et `registre-traitements.md`

## 6. Cartographie géographique

```
🇩🇪 Frankfurt (eu-central-1)
  ├─ AWS (infrastructure)
  ├─ Supabase (DB, Auth, Storage, Vault, pgvector)
  └─ Bedrock (Claude Sonnet + Haiku + embeddings)

🇫🇷 Paris (eu-west-3)
  └─ Mistral La Plateforme (OCR)

🇪🇺 UE (multi-région)
  ├─ Stripe Payments Europe
  ├─ Vercel (edge global, compute UE)
  ├─ Sentry (SaaS EU)
  └─ PostHog (cloud EU ou self-hosted)

🌐 Variable
  └─ Microsoft Graph (région du tenant Client)
```

## 7. Conformité par sous-traitant

| Sous-traitant | nLPD | RGPD | SOC 2 | ISO 27001 | DPA dispo |
|---|---|---|---|---|---|
| AWS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supabase | ✅ | ✅ | ✅ | 🟡 en cours | ✅ |
| Anthropic (via Bedrock) | ✅ | ✅ | ✅ | — | ✅ (via AWS) |
| Mistral AI | ✅ | ✅ | 🟡 en cours | — | ✅ |
| Microsoft | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stripe | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vercel | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sentry | ✅ | ✅ | ✅ | ✅ | ✅ |
| PostHog | ✅ | ✅ | ✅ | — | ✅ |

## 8. Documents associés

Pour chaque sous-traitant critique :
- DPA signé conservé dans `/legal/dpa-signed/[sous-traitant]/` (privé)
- Notes d'évaluation initiale
- Revue annuelle datée

## 9. Plan d'action

### Avant 1er client payant
- [ ] DPA signé avec AWS
- [ ] DPA signé avec Supabase
- [ ] DPA signé avec Stripe
- [ ] DPA signé avec Vercel
- [ ] Vérification rétention Bedrock
- [ ] Vérification Mistral DPA

### Avant 5e client payant
- [ ] DPA signé avec Sentry
- [ ] DPA signé avec PostHog
- [ ] Sélection et DPA outil emailing
- [ ] Revue de tous les DPA par juriste

### Annuellement
- [ ] Revue de l'inventaire (rotation, ajouts, retraits)
- [ ] Vérification certifications à jour
- [ ] Mise à jour des contrats

## 10. À tenir à jour

Modifications de cet inventaire :
- Logger dans Git avec message explicite
- Notifier équipe et clients (si ajout)
- Mettre à jour `registre-traitements.md`
- Mettre à jour `politique-confidentialite.md` si liste publique modifiée
