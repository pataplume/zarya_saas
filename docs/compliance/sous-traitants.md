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

ZARYA recourt à un nombre limité de sous-traitants principaux, situés en UE ou en Suisse (pays adéquat). Ils sont catégorisés par criticité :

- **Critique** : impact direct sur les données métier (IA, DB)
- **Important** : services support (paiement, monitoring)
- **Accessoire** : outils internes (analytics)

## 2. Liste complète

### 2.1 Amazon Web Services (AWS) — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Infrastructure cloud sous-jacente à Supabase (DB, Auth, Storage) — pas d'usage IA |
| **Région** | eu-central-2 (Zurich, Suisse) |
| **Données traitées** | Toutes les Données du Client (via Supabase) |
| **Sous-sous-traitants** | AWS infrastructure providers (data centers Suisse, Zurich) |
| **DPA signé** | À signer avant production — DPA standard AWS disponible |
| **Certifications** | ISO 27001, ISO 27017, ISO 27018, SOC 2, GDPR compliant |
| **Cadre de transfert** | Suisse — pays adéquat (RGPD art. 45 / nLPD), pas de transfert problématique |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://aws.amazon.com/compliance/ |

> AWS n'intervient **que comme infrastructure sous-jacente de Supabase** (base de données, authentification, stockage). ZARYA n'utilise plus AWS comme fournisseur d'inférence IA (Bedrock retiré, cf. ADR 0010). La couche IA est désormais opérée par Infomaniak (§ 2.3).

### 2.2 Supabase — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Base de données Postgres, Auth, Storage, Realtime, Vault, pgvector |
| **Région** | eu-central-2 (Zurich, Suisse, sur AWS) |
| **Données traitées** | Toutes les Données structurées et fichiers du Client |
| **Sous-sous-traitants** | AWS (infrastructure sous-jacente) |
| **DPA signé** | À signer — DPA standard Supabase disponible |
| **Certifications** | SOC 2 Type II, HIPAA |
| **Cadre de transfert** | Suisse — pays adéquat (RGPD art. 45 / nLPD), pas de transfert problématique |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://supabase.com/legal |

### 2.3 Infomaniak AI Services — Critique

| Élément | Valeur |
|---|---|
| **Service rendu** | Couche IA complète : chat (classification, extraction, génération, RAG), vision/OCR (Phase 4.1+), embeddings (Phase 4.1+) — API OpenAI-compatible |
| **Région** | Suisse |
| **Données traitées** | Contenus envoyés temporairement aux modèles (documents, propositions, questions) |
| **Sous-sous-traitants** | Infrastructure Infomaniak (Suisse) |
| **DPA signé** | À signer avant production — DPA Infomaniak (référence à confirmer) |
| **Engagement** | Infomaniak n'entraîne pas ses modèles sur les données client ; les données restent en Suisse pour l'inférence |
| **Rétention** | Pas de stockage long terme des contenus soumis |
| **Certifications** | À confirmer |
| **Cadre de transfert** | Suisse — pays adéquat (nLPD / RGPD), pas de transfert problématique |
| **Date d'intégration** | À partir de [DATE] |
| **Site web** | https://www.infomaniak.com/ |

> Société suisse, infrastructure suisse : la couche d'inférence IA relève d'un opérateur **non soumis au CLOUD Act**. Voir ADR 0010 pour le périmètre exact de la souveraineté (la DB Supabase/AWS et l'hébergement Vercel restent US).

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
| **Région** | Edge global (caching) + compute principal sur fra1 (Frankfurt, UE) |
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
🇨🇭 Suisse
  ├─ Infomaniak AI Services (chat, vision/OCR, embeddings)
  ├─ AWS eu-central-2 (infrastructure sous-jacente de Supabase, Zurich)
  └─ Supabase eu-central-2 (DB, Auth, Storage, Vault, pgvector — Zurich)

🇩🇪 Frankfurt (UE)
  └─ Vercel fra1 (hébergement app, compute, cron)

🇪🇺 UE (multi-région)
  ├─ Stripe Payments Europe
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
| Infomaniak | ✅ | ✅ | 🟡 à confirmer | 🟡 à confirmer | 🟡 à signer |
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
- [ ] DPA signé avec Infomaniak
- [ ] Vérification certifications Infomaniak (SOC 2 / ISO 27001)

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
