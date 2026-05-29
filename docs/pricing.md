---
status: draft
owner: tristan
last_updated: 2026-05-26 (v0.2 — ajout setup fees)
priority: P1
type: foundation
depends_on: [vision, personas]
referenced_by: [vision, roadmap, onboarding-fiduciaire]
---

# Pricing ZARYA

> Modèle économique et plans tarifaires. Document à valider en interviews qualitatives.

## 1. Principes directeurs

### 1.1 Pricing aligné sur la valeur
ZARYA fait gagner 10-30 heures par mois à un cabinet. À 80-120 CHF/heure facturée par les fiduciaires, l'économie représente 800-3600 CHF/mois. Le pricing doit capturer une fraction raisonnable de cette valeur.

### 1.2 Pricing prévisible
SaaS B2B classique : abonnement mensuel par cabinet, plans clairs, pas de surprise. Le cabinet doit pouvoir budgéter sans calculs complexes.

### 1.3 Pricing transparent
Pas de pricing caché ni de "Sur devis" pour la majorité des plans. Affichage public sur le site.

### 1.4 Pricing simple à vendre
3 plans maximum. Une décision binaire à chaque marche (Starter ou Pro, Pro ou Enterprise).

### 1.5 Pricing modulable côté coûts
Plus le cabinet utilise de volume (clients, employés, LLM), plus il monte dans les plans. Pas de risque de cabinet qui consomme 10x sans payer plus.

### 1.6 Pack de déploiement initial (setup fee)
Au-delà de l'abonnement récurrent, ZARYA propose un **Pack de déploiement initial** (setup fee) facturé une seule fois au démarrage. Ce pack couvre la configuration assistée, l'import du portefeuille, la formation équipe, et l'accompagnement des 30 premiers jours.

**Principe d'articulation avec le self-service** :
- **Starter** : pack **optionnel** (le self-service reste le chemin par défaut, conformément à [ADR 0006](./architecture/decisions/0006-onboarding-self-service-mvp.md))
- **Pro** : pack **fortement recommandé** et obligatoire si > 50 clients à importer
- **Enterprise** : pack **toujours sur devis**

Le naming commercial est "Pack de déploiement initial" ou "Accompagnement de mise en production", pas "frais d'installation" (positionnement premium plutôt que legacy software).

## 2. Plans proposés (à valider en interview)

### 2.1 Starter — 199 CHF/mois

**Cible** : cabinets 1-3 personnes, jusqu'à 20 clients PME.

**Pack de déploiement initial** : **optionnel**
- Self-service par défaut : 0 CHF (onboarding wizard automatisé, 30 min)
- Pack démarrage assisté (option) : **490 CHF** — 2h d'accompagnement live (configuration Microsoft 365, connexion NAS, premier import client)

**Inclus dans l'abonnement** :
- Jusqu'à 20 clients actifs
- Jusqu'à 100 employés cumulés (référentiel salaires)
- 1 compte responsable + 2 collaborateurs
- Tous les modules MVP : Onboarding, Dashboard client, Doc, CRM, Calendar
- Module Facture en accès
- 100 CHF/mois de quota LLM inclus (~2000 documents classés)
- Intégrations : Microsoft 365, Zefix, 1 NAS
- Stockage : 50 GB inclus
- Support email standard (réponse < 48h)

**Non inclus** :
- Module Salaire complet
- Module Search (RAG)
- Connecteur API Bexio Payroll
- Multiple boîtes Microsoft partagées
- Support prioritaire

**Coût estimé d'infra** : ~80 CHF/mois → marge brute ~60%.

**Justification du setup optionnel et non obligatoire** :
- Préserve le différenciateur self-service ZARYA (ADR 0006)
- Évite de multiplier par 5x le ticket d'entrée du premier mois
- Marché 1-3 personnes : sensible au prix, sensible à la friction de vente
- Le cabinet qui veut être accompagné peut payer 490 CHF (option, pas obligation)

### 2.2 Pro — 499 CHF/mois

**Cible** : cabinets 4-15 personnes, jusqu'à 100 clients PME.

**Pack de déploiement initial** : **fortement recommandé**
- Tarif standard : **2'900 CHF**
- Tarif early adopter (Founding Partner, 5-10 premiers cabinets) : **1'500 CHF**
- Obligatoire si > 50 clients à importer (sécurité de l'import portefeuille)

**Contenu du pack Pro** :
- Kick-off (1h) avec CSM ZARYA
- Paramétrage complet (modèles d'emails, conventions de nommage, mapping comptable)
- Import portefeuille jusqu'à 100 clients (session live)
- Configuration des workflows (politiques de relance, échéances récurrentes)
- Formation équipe (2h, jusqu'à 5 personnes)
- Accompagnement prioritaire sur les 30 premiers jours
- Adaptation des règles de classement documentaire

**Inclus dans l'abonnement** :
- Jusqu'à 100 clients actifs
- Jusqu'à 1000 employés cumulés
- Comptes illimités (membres du cabinet)
- Tous les modules MVP + Search + Salaire (Phase 2-3)
- 500 CHF/mois de quota LLM inclus
- Toutes les intégrations
- Stockage : 500 GB inclus
- Support prioritaire (réponse < 24h, chat dédié)
- Webhooks et API d'export (Phase 2)

**Coût estimé d'infra** : ~150 CHF/mois → marge brute ~70%.

**Justification du tarif setup** :
- Couvre 8-12h de travail CSM (~120-180 CHF/h × 12h ≈ 1'500-2'200 CHF de coût direct)
- Compense le risque de churn précoce si l'onboarding échoue
- Permet d'investir dans la qualité de l'activation (CSM dédié, suivi 30j)
- À 5-10 cabinets Pro/an au démarrage, le setup fee finance partiellement l'équipe CSM

**Décision sur le prix mensuel à 499 vs 599 CHF** : maintenu à **499 CHF** au MVP. Augmentation à 599 CHF possible Phase 2 si validation interview confirme. Justification : on n'augmente pas un prix non validé avant d'avoir signé des cabinets pilotes au prix initial.

### 2.3 Enterprise — sur devis
**Cible** : cabinets 15+ personnes ou > 100 clients PME ou besoins spécifiques.

**Inclus** :
- Clients et employés illimités
- Quotas LLM personnalisés
- SLA contractuel (uptime, support)
- Account manager dédié
- Onboarding personnalisé
- **Option Suisse stricte** : hébergement Azure Switzerland North
- Connecteurs spécifiques (Abacus certifié, etc.)
- Audits sécurité dédiés
- Formation équipe

**Tarif indicatif abonnement** : à partir de **1'500 CHF/mois**, négocié au cas par cas.

**Pack de déploiement initial Enterprise** : **toujours sur devis, dès 5'000 CHF**
- Périmètre variable selon les besoins (migration avancée, audit documentaire, sécurité, connecteurs spécifiques, formation multi-équipe, hébergement suisse strict, configuration SLA)
- Cabinets > 200 clients : 7'500-15'000 CHF typique
- Cabinets avec migration depuis legacy software : devis sur mesure

**Coût estimé d'infra** : variable selon options → marge brute 60-75%.

## 3. Période d'essai

### 3.1 Configuration
- **14 jours d'essai gratuit** sans carte bancaire
- Accès complet au plan Pro
- Possibilité d'importer le portefeuille existant pendant l'essai
- Aucune limitation fonctionnelle

### 3.2 Fin d'essai
- À J-3 : email rappel
- À J : prompt de souscription dans l'UI
- Grace period 7 jours avant suspension
- Suspension : accès lecture seule, pas de nouvelle ingestion
- Reprise immédiate à la souscription

### 3.3 Pas de free tier permanent
**Décision** : pas de plan gratuit indéfini.

Raisons :
- Coûts LLM imprévisibles si gratuit
- Risque de pollution de la base par des comptes non engagés
- Les fiduciaires sérieux n'attendent pas du gratuit
- L'essai 14 jours suffit à valider

## 4. Économie unitaire

### 4.1 Coûts variables par cabinet (estimation)

Pour un cabinet **Pro** typique (60 clients, 400 employés, usage moyen) :

| Poste | Coût mensuel |
|---|---|
| Supabase Pro (mutualisé sur 100 cabinets) | ~3 CHF |
| Infomaniak LLM (catégories `chat_large` + `chat_small`) | à confirmer (catalogue Infomaniak Beta) |
| Infomaniak vision (Phase 4.1+) | à confirmer (catalogue Infomaniak Beta) |
| Microsoft Graph (gratuit pour l'usage normal) | 0 CHF |
| Stockage Supabase Storage | 5-15 CHF |
| Vercel compute (mutualisé) | ~3 CHF |
| Stripe (3% sur paiement) | ~15 CHF |
| Monitoring (Sentry, etc., mutualisé) | ~2 CHF |
| **Total coûts variables** | **~100-170 CHF** |

### 4.2 Marge brute par plan

| Plan | Tarif | Coûts | Marge brute |
|---|---|---|---|
| Starter | 199 CHF | 80 CHF | ~60% |
| Pro | 499 CHF | 150 CHF | ~70% |
| Enterprise (1500 CHF moyen) | 1500 CHF | 400 CHF | ~73% |

Marge brute cible globale : **65-75%**, viable pour scaler.

### 4.3 Coûts fixes (à amortir)
- Équipe produit/tech : 30-60K CHF/mois (à 3-6 personnes)
- Outils dev (GitHub, Sentry, Posthog, etc.) : ~500 CHF/mois
- Infra non-mutualisée (CI, prod monitoring) : ~200 CHF/mois
- Marketing, sales : variable

### 4.4 Seuil de rentabilité opérationnel
À 60-80 cabinets Pro actifs (≈ 30K-40K MRR), ZARYA couvre une équipe de 3-4 personnes. À 100 cabinets payants, marge opérationnelle positive.

## 5. Limites de chaque plan

### 5.1 Limites soft (alertes)
À l'approche de la limite : email d'alerte + notification dans l'UI :
- 80% du quota clients
- 80% du quota employés
- 80% du quota LLM mensuel

Suggestion d'upgrade affichée.

### 5.2 Limites hard (blocages)
Au dépassement :
- **Nouveau client** : impossible de créer le client X+1 sur Starter sans upgrade
- **Quota LLM** : blocage temporaire des extractions, fallback validation manuelle, retour normal au cycle de facturation suivant
- **Stockage** : nouveaux uploads bloqués, options : nettoyer ou upgrader

### 5.3 Politique de bonus
Quotas LLM non utilisés ne sont **pas reportés** (mois sur mois). Évite l'accumulation et la prévisibilité côté ZARYA.

## 6. Paiement et facturation

### 6.1 Modalités
- **Carte bancaire** via Stripe (par défaut, démarrage immédiat)
- **Facture mensuelle** par virement SEPA/IBAN suisse (Pro et Enterprise)
- **Annuel avec remise 15%** : disponible Pro et Enterprise

### 6.2 Devise et TVA
- **CHF** comme devise principale
- **TVA suisse 8.1%** ajoutée pour les cabinets en Suisse
- **Pas de TVA** pour les cabinets hors Suisse (reverse charge)

### 6.3 Renouvellement
- Renouvellement automatique
- Possibilité d'annuler à tout moment, prend effet en fin de période
- Pas de remboursement au prorata

### 6.4 Changement de plan
- Upgrade : effet immédiat, calcul au prorata sur le mois en cours
- Downgrade : effet à la fin du cycle de facturation
- Limites vérifiées avant downgrade (impossible si dépassement actuel)

## 7. Pricing concurrentiel (estimation)

### 7.1 Concurrents directs
Aucun concurrent direct identifié en Suisse romande sur ce positionnement exact.

### 7.2 Concurrents adjacents et benchmarks setup

| Outil | Cible | Abonnement | Setup typique |
|---|---|---|---|
| Bexio | PME directement | 39-99 CHF/mois par PME | 0-1'500 CHF (avec partenaire) |
| Klara | PME directement | 19-59 CHF/mois par PME | 0-500 CHF |
| Run my Accounts | PME + fiduciaires | Modulaire ~50-200 CHF | Sur devis |
| Pennylane (FR) | Fiduciaires + PME | 30-100 EUR/mois par client | 0-2'000 EUR |
| MIK (CH) | Fiduciaires (legacy) | Sur devis, ~500-2'000 CHF/mois | 5'000-20'000 CHF |
| Odoo (ERP) | PME tous secteurs | 25-50 CHF/user/mois | **4'900-19'900 CHF** (référence) |

**Note importante sur le benchmark setup** : Odoo est régulièrement cité comme référence avec des setup à 4'900-19'900 CHF, mais c'est un **ERP complet** nécessitant paramétrage métier lourd (compta, ventes, RH, stocks). ZARYA est un **copilote spécialisé fiduciaire** avec onboarding largement automatisé par design. Le bon benchmark pour ZARYA est plutôt Bexio + ses partenaires, Pennylane, ou Klara, pas Odoo.

### 7.3 Positionnement
ZARYA se positionne **au-dessus** des outils PME (Bexio, Klara) mais **en-dessous** des solutions legacy fiduciaires (MIK). Justification : valeur capturée par un copilote IA dédié aux fiduciaires, pas un outil PME générique.

**Sur les setup fees** : ZARYA se positionne **entre Bexio (souvent 0 CHF) et MIK (5'000-20'000 CHF)**. Pack Starter à 490 CHF (optionnel) et Pack Pro à 2'900 CHF correspondent à du conseil de qualité sans atteindre les tarifs legacy.

## 8. Stratégie commerciale par plan

### 8.1 Starter
- **Acquisition** : self-service via landing page + SEO
- **Onboarding** : self-service complet (wizard automatisé)
- **Upsell** : alertes proactives quand le cabinet approche les limites
- **Rétention** : automatisée (email digest, newsletter produit)

### 8.2 Pro
- **Acquisition** : self-service OU outbound ciblé (LinkedIn, événements fiduciaires)
- **Onboarding** : wizard + session live import portefeuille
- **Upsell** : démarche commerciale active pour Enterprise (account management)
- **Rétention** : CSM dédié à partir de la 2e année

### 8.3 Enterprise
- **Acquisition** : sales pipeline, démos, négociation
- **Onboarding** : complet, accompagnement 30-60 jours
- **Upsell** : services additionnels, formations
- **Rétention** : SLA, points trimestriels, customer success

## 9. Modèle de croissance projeté

Projection à 24 mois (hypothèses à valider) :

| Mois | Starter | Pro | Enterprise | MRR (CHF) |
|---|---|---|---|---|
| M0 | 0 | 0 | 0 | 0 |
| M3 | 2 | 1 | 0 | 897 |
| M6 | 5 | 3 | 0 | 2'492 |
| M12 | 15 | 10 | 1 | 9'975 |
| M18 | 30 | 25 | 2 | 21'445 |
| M24 | 50 | 45 | 4 | 38'445 |

Hypothèses :
- Taux d'essai → payant : 25%
- Taux de churn annuel : 5%
- Cabinets pilotes en plan Starter au début, upgrades progressifs vers Pro
- 1 Enterprise par 30 cabinets payants en moyenne

ARR à M24 : ~460K CHF. Permet d'envisager une levée de fonds ou rentabilité opérationnelle selon les ambitions.

## 10. À valider en interview

### 10.1 Questions pricing à poser
- "Combien faudrait-il que ça coûte par mois pour que vous testiez ?"
- "À partir de quel tarif ça devient trop cher ?"
- "Préférez-vous payer un fixe mensuel ou à l'usage (par client) ?"
- "199 CHF/mois pour cabinet petit, 499 CHF/mois pour cabinet pro : votre réaction ?"

### 10.2 Hypothèses à valider
- Le pricing est-il accessible pour les cabinets 1-3 personnes ?
- 499 CHF/mois est-il accepté pour les cabinets 5-15 personnes ?
- Les cabinets > 15 personnes acceptent-ils du sur-devis ?
- La période d'essai 14 jours suffit-elle ?

### 10.3 Risques pricing
- **Sous-pricing** : si on s'aligne sur Bexio (~50 CHF), pas de marge pour une équipe produit
- **Sur-pricing** : si on facture > 1000 CHF en Starter, blocage acquisition
- **Pricing à l'usage** : trop imprévisible pour les cabinets

## 11. Évolution prévue

### 11.1 Phase 1 (MVP, 0-12 mois)
- 3 plans simples (Starter, Pro, Enterprise)
- Pricing affiché publiquement (sauf Enterprise)
- Pas de plan annuel au démarrage (carte bancaire mensuelle)

### 11.2 Phase 2 (12-24 mois)
- Plan annuel avec remise 15%
- Plan Starter+ (intermédiaire si demande)
- Add-ons modulaires (ex. "Storage extra", "LLM extra")

### 11.3 Phase 3 (24+ mois)
- Pricing par client final (modèle marketplace)
- Plans verticaux (avocats fiscalistes, family offices)
- Co-branding pour partenaires

## 12. Politique de remises et négociations

### 12.1 Remises standards
- **Cabinet pilote** (les 5 premiers signataires) : -50% les 12 premiers mois
- **Engagement annuel** : -15% sur l'abonnement (pas sur le setup)
- **Volume** (cabinet Enterprise > 200 clients) : négocié
- **Référencement** : 1 mois offert par cabinet référencé qui souscrit

### 12.2 Offres de lancement (Founding Partners, 5-10 premiers cabinets)

| Offre | Abonnement | Setup |
|---|---|---|
| **Starter Early** (3 premiers) | 99 CHF/mois × 6 mois, puis 199 CHF | Setup offert |
| **Starter Founding** (suivants) | 199 CHF/mois | Setup à 290 CHF (au lieu de 490) |
| **Pro Founding Partner** (3 premiers) | 299 CHF/mois × 6 mois, puis 499 CHF | Setup à 1'500 CHF (au lieu de 2'900) |
| **Pro Early** (suivants) | 499 CHF/mois | Setup à 2'000 CHF (au lieu de 2'900) |
| **Enterprise Pilote** | Sur devis avec -30% | Setup réduit sur devis |

**Engagement contrepartie pour les Founding Partners** :
- Disponibilité pour 1 interview de feedback par trimestre
- Témoignage écrit et/ou vidéo après 6 mois d'utilisation
- Référencement public possible (logo cabinet sur landing zarya.ch)
- Premier accès aux nouvelles fonctionnalités

### 12.3 Politique d'override
Le responsable commercial peut accorder jusqu'à -20% additionnels sur Pro et Enterprise. Au-delà, validation associé. Override sur le setup possible jusqu'à -50% pour les cas stratégiques (cabinet emblématique, référence sectorielle).

## 13. Questions ouvertes

### 13.1 Sur l'abonnement
- [ ] **Tarif Starter exact** : 199 CHF est-il accessible ou trop cher pour cabinets 1 personne ?
- [ ] **Quota LLM inclus** : 100 CHF en Starter est-il généreux ou serré ?
- [ ] **Stockage limit** : 50 GB Starter est-il réaliste vu les volumes documents ?
- [ ] **Période d'essai** : 14 jours suffisent ou 30 jours mieux ?
- [ ] **Plan annuel** : disponible dès le MVP ou Phase 2 ?
- [ ] **Carte bancaire obligatoire en essai** : freine l'inscription ou pas ?
- [ ] **TVA** : facturation directe ou pass-through Stripe ?
- [ ] **Prix Enterprise** : indication publique ou totalement opaque ?
- [ ] **Bundle vs modulaire** : tout inclus ou modules à la carte ?
- [ ] **Pro à 499 vs 599 CHF** : à valider en interview avant ajustement éventuel Phase 2

### 13.2 Sur les setup fees (à valider en interview)
- [ ] **Starter setup optionnel à 490 CHF** : taux d'adoption attendu ? (hypothèse : 30-50% des Starter le prendront)
- [ ] **Pro setup à 2'900 CHF** : accepté ou trop cher pour cabinets 4-15 personnes ?
- [ ] **Pro setup obligatoire si > 50 clients** : ce seuil est-il pertinent ?
- [ ] **Founding Partner setup 1'500 CHF** : suffisamment attractif pour signer les 3 premiers Pro ?
- [ ] **Naming** : "Pack de déploiement initial" vs "Accompagnement de mise en production" vs autre ?
- [ ] **Modalité de facturation setup** : à la signature, ou échelonné (50% kick-off + 50% à la fin) ?
- [ ] **Garantie satisfaction setup** : remboursement si insatisfaction après 30 jours ?
- [ ] **Setup remote-only ou présentiel possible** : Geneva/Lausanne/Zurich propose présentiel ?

### 13.3 Questions critiques à poser en interview pricing
- "Si je vous propose un outil à 199 CHF/mois sans frais de setup que vous installez vous-même en 30 min, ou à 199 + 990 CHF avec un consultant qui vous accompagne 4h, lequel choisissez-vous ?"
- "Pour un outil à 499 CHF/mois qui migre vos 80 clients existants, combien acceptez-vous de payer en frais d'installation ?"
- "Quelle est la dernière fois que vous avez payé pour un setup logiciel ? Combien ? Pour quel logiciel ?"
