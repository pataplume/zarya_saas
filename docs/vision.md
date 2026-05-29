---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
type: foundation
depends_on: []
referenced_by: [personas, roadmap, modules/crm, modules/doc, modules/calendar, modules/facture, modules/salaire]
---

# Vision produit ZARYA

## 1. La phrase qui résume tout

**ZARYA est le copilote opérationnel des fiduciaires : il transforme le chaos quotidien des documents, échéances et obligations en un système où chaque dossier client est toujours à jour, sans surprise.**

## 2. Le problème qu'on résout

### 2.1 La réalité d'une fiduciaire suisse aujourd'hui

Une fiduciaire de 5-20 personnes gère typiquement 100 à 300 mandats clients. Pour chaque client :
- Recevoir mensuellement ou trimestriellement des documents (relevés bancaires, factures, justificatifs)
- Établir et soumettre des déclarations TVA, fiscales, salaires
- Respecter des échéances strictes (souvent légales, avec pénalités)
- Communiquer avec le client pour obtenir les éléments manquants
- Coordonner les calculs et productions dans 2-3 logiciels métier (Bexio, Crésus, Abacus...)

**Le résultat** : un quotidien dispersé entre Outlook, NAS, Excel maison, logiciels comptables, classeurs papier. Le risque opérationnel est constant.

### 2.2 Les 5 douleurs principales identifiées

1. **"Je ne sais pas où en est chaque dossier"**
   Le responsable du cabinet n'a aucune vue temps réel sur l'état des 200 dossiers. Il découvre les retards quand ils sont déjà critiques.

2. **"Je passe mes journées à relancer les clients"**
   Les gestionnaires salaires perdent 1-2 jours par mois à envoyer des emails individuels pour obtenir les éléments du mois.

3. **"Je classe et renomme manuellement des centaines de documents"**
   Chaque collaborateur reçoit des emails toute la journée avec des PJ qu'il doit trier, renommer, ranger dans le NAS au bon endroit.

4. **"Je ressaisis les factures dans 2 logiciels"**
   Lire la facture PDF, saisir dans Bexio, vérifier la TVA, préparer le paiement. 5 minutes par facture × 50 factures par jour = 4 heures.

5. **"Je ne retrouve plus l'info quand j'en ai besoin"**
   "Le client X m'avait envoyé un contrat l'an dernier, je l'avais classé... où ?" Recherche fastidieuse dans 10 ans d'archives.

### 2.3 Le coût caché

Ces inefficacités ont des conséquences concrètes :
- **Marge** : 30-40% du temps des collaborateurs consacré à des tâches sans valeur ajoutée
- **Risque** : retards de déclarations → amendes, pertes de mandats
- **Croissance bloquée** : impossible de prendre plus de clients sans embaucher
- **Attractivité** : difficulté à recruter pour des tâches répétitives

## 3. La solution ZARYA

### 3.1 Principe directeur

**L'IA propose, l'humain valide.**

ZARYA n'automatise pas tout. Il **propose** la bonne action au bon moment et permet à l'humain de **valider en 1 clic** quand la proposition est juste. La fiabilité vient de cette boucle propose/valide, pas d'une automatisation aveugle.

### 3.2 Les 4 bénéfices produits

**Bénéfice 1 — Vision temps réel sur tous les dossiers**
Un dashboard unique montre les 200 dossiers : complets, incomplets, en retard, à risque. Le responsable sait à 9h du matin où concentrer l'attention de son équipe.

**Bénéfice 2 — Automatisation de la collecte documentaire**
Les emails entrants sont automatiquement classés et rattachés au bon client. Les documents attendus manquants déclenchent des relances personnalisées (validées par humain).

**Bénéfice 3 — Extraction et synthèse intelligentes**
Les factures sont lues, les champs extraits avec niveau de confiance, validation 1-clic puis export vers le logiciel comptable. Pareil pour l'onboarding employés et les changements salariaux.

**Bénéfice 4 — Recherche conversationnelle avec sources**
"Quand le client X a-t-il signé son dernier avenant ?" → réponse instantanée avec lien vers le document source. Plus de fouille dans le NAS.

### 3.3 Le cycle vertueux

```
        Document entrant (email)
                ↓
       Classification IA + rattachement client
                ↓
       Statut dossier client mis à jour
                ↓
       Calcul du risque recalculé
                ↓
       Échéances et relances ajustées
                ↓
       Le responsable voit en temps réel
                ↓
       Prochaine action prioritaire identifiée
```

Chaque action enrichit le CRM (centre de vérité) et l'index Search. Le système s'améliore avec l'usage.

## 4. Notre positionnement

### 4.1 Ce qu'on est
- **Un copilote opérationnel** pour la fiduciaire dans son ensemble
- **Une couche d'orchestration** au-dessus des logiciels métier existants
- **Un dashboard de pilotage** pour le responsable du cabinet
- **Un outil de productivité** pour les collaborateurs
- **Un portail moderne** pour les clients finaux

### 4.2 Ce qu'on n'est pas
- **Pas un logiciel de paie** (Bexio, Crésus, Abacus restent en place)
- **Pas un logiciel de comptabilité** (idem)
- **Pas un outil de facturation** (le cabinet facture ses clients par ailleurs)
- **Pas un CRM commercial** (suivi de pipeline, opportunités → pas notre métier)

### 4.3 Notre relation avec l'écosystème existant
ZARYA **complète** les logiciels métier au lieu de les remplacer.

- Cabinet utilise Bexio Payroll → ZARYA pousse les données structurées vers Bexio
- Cabinet utilise Crésus → ZARYA exporte les fichiers d'import Crésus
- Cabinet utilise Excel maison → ZARYA génère des Excel propres pour saisie manuelle

Le cabinet **garde ses outils**. ZARYA ajoute la couche d'orchestration et d'IA qui leur manque.

## 5. Notre marché

### 5.1 Marché cible MVP
**Fiduciaires de Suisse romande**, 3 à 30 personnes, 50 à 300 clients PME.

Profil :
- Mix de mandats compta + fiscalité + salaires
- Utilisent au moins un logiciel métier moderne (Bexio, Crésus, Abacus)
- Sensibilisés aux gains d'efficacité par les outils numériques
- Disposés à investir 300-600 CHF/mois pour gagner du temps opérationnel

### 5.2 Marché élargi (Phase 2)
- Suisse alémanique et tessinoise (i18n DE/IT)
- Cabinets plus grands (50-200 personnes) avec offres Enterprise
- Verticales adjacentes (avocats fiscalistes, family offices, asset managers)

### 5.3 Hors-scope (au moins MVP)
- France, Belgique, Luxembourg : marchés différents (TVA, salaires, déclarations)
- Cabinets de Big 4 : besoins enterprise très spécifiques
- Particuliers fortunés en direct (B2C) : modèle commercial différent

## 6. Différenciateurs

### 6.1 vs concurrents directs
La concurrence locale est faible. Les outils existants sont :
- **Bexio CRM, Klara, Run my Accounts** : orientés PME directement, pas fiduciaires
- **Outils fiduciaires legacy** (MIK, Newhouse) : digitaux mais sans IA moderne
- **Solutions custom** : Excel et logique métier dans la tête des associés

ZARYA est positionné sur un **vide de marché** : un outil moderne IA-first dédié aux fiduciaires.

### 6.2 vs construire en interne
Un cabinet pourrait théoriquement construire ses propres outils. Mais :
- Compétences IA hors de portée d'un cabinet
- Mise à jour continue requise (conformité, intégrations)
- Coût total > prix ZARYA × 10

### 6.3 Notre moat à 2-3 ans
- **Intégrations natives** avec Bexio Payroll, Crésus, Abacus (effort considérable)
- **Bibliothèque de templates et mappings** maintenue par les cabinets clients
- **Modèles IA fine-tunés** sur les documents fiduciaires suisses
- **Conformité RGPD/nLPD** documentée et auditée

## 7. Modèle économique

### 7.1 Pricing cible
SaaS B2B mensuel par cabinet, avec 3 plans :
- **Starter** : 199 CHF/mois (≤ 20 clients, cabinet 1-3 personnes)
- **Pro** : 499 CHF/mois (≤ 100 clients, cabinet 4-15 personnes)
- **Enterprise** : sur devis (> 100 clients, > 15 personnes)

Période d'essai 14 jours sans CB.

⚠️ Hypothèses à valider en interviews. Pricing détaillé dans [`pricing.md`](./pricing.md).

### 7.2 Économie unitaire (estimation)
| Poste | Coût par cabinet/mois |
|---|---|
| Supabase | ~3 CHF (mutualisé sur 100 cabinets) |
| LLM (Infomaniak, catégories `chat_*`) | à confirmer (catalogue Infomaniak Beta) |
| OCR (Infomaniak vision, Phase 4.1+) | à confirmer (catalogue Infomaniak Beta) |
| Infra (Vercel, monitoring) | ~5 CHF |
| Stripe (3%) | ~10 CHF |
| **Total coûts variables** | **~80-150 CHF** |
| **Marge brute Pro (499 CHF)** | **70-80%** |

Modèle viable. Marge soutenable y compris en plan Starter avec quotas LLM serrés.

### 7.3 Métriques business clés
- **MRR** (revenu mensuel récurrent)
- **CAC** (coût d'acquisition par cabinet)
- **LTV** (valeur vie d'un cabinet)
- **Churn rate** (objectif < 5%/an, fiduciaires sont collants)
- **NRR** (net revenue retention, avec upsell Starter → Pro)

## 8. Stratégie produit

### 8.1 Phase 0 — Validation marché (en cours)
- 10-15 interviews qualitatives fiduciaires
- Validation des douleurs et willingness to pay
- Identification de 3 cabinets pilotes pour MVP

### 8.2 Phase 1 — MVP (P0)
Modules livrés :
- Onboarding Fiduciaire (self-service)
- Onboarding Client (assisté IA)
- Dashboard Client (UI partagée)
- Zarya Doc (inbox documentaire)
- Zarya CRM (centre de vérité)
- Zarya Calendar (échéances et relances)
- Brique Extraction IA transverse

**Objectif** : 3 cabinets pilotes opérationnels, signaux quantitatifs sur l'usage.

### 8.3 Phase 2 — Différenciation (P1)
- Zarya Search (RAG avec sources)
- Zarya Facture (extraction + export)
- Connecteurs natifs Bexio Payroll
- Option Suisse stricte (Azure Switzerland North)

**Objectif** : 20-30 cabinets payants. Signaux de PMF (product-market fit).

### 8.4 Phase 3 — Verticalisation (P2)
- Zarya Salaire complet (cycle mensuel client + fiduciaire)
- Connecteurs natifs Crésus, Abacus
- Module Swissdec ELM (transmetteur)
- Expansion DE/IT

**Objectif** : 100+ cabinets. Domination Suisse romande.

### 8.5 Phase 4 — Écosystème
- Marketplace de templates (cabinets partagent leurs configurations)
- Connecteurs partenaires (banques, assurances)
- API publique pour développeurs tiers

## 9. Principes produit non-négociables

1. **L'humain garde la main** : pas d'automatisation aveugle sur les décisions importantes
2. **Sources visibles** : toute donnée extraite ou réponse Search a un lien vers la source
3. **Pas de jargon** sur les surfaces client final : adaptation au public
4. **Multi-tenant strict** : aucune fuite cross-cabinet, aucune fuite cross-client
5. **Conformité RGPD/nLPD by design** : pas une feature, une fondation
6. **Mobile-first sur le dashboard client** : majorité des consultations sur téléphone
7. **Performance ressentie** : sauvegarde temps réel, pas de bouton "Save"
8. **Resilience over completeness** : un système qui dégrade gracieusement plutôt qu'un système qui plante
9. **Self-service avec assistance ciblée** : onboarding fiduciaire en autonomie, sauf import portefeuille
10. **Audit > IA** : tout est tracé, l'IA n'est jamais une boîte noire

## 10. Indicateurs de succès produit

### 10.1 Adoption (court terme)
- Taux de complétion d'onboarding fiduciaire > 70%
- Taux d'utilisation du dashboard client par les contacts RH > 60%
- NPS responsables cabinet > 40

### 10.2 Productivité (moyen terme)
- Temps moyen pour traiter un document divisé par 5
- Temps moyen de cycle salaire mensuel divisé par 3
- 90% des factures exportées sans correction manuelle

### 10.3 Business (long terme)
- 50 cabinets actifs à 18 mois
- ARR > 500K CHF à 24 mois
- Churn annuel < 5%

## 11. Risques majeurs identifiés

### 11.1 Risque marché
- **Adoption lente des fiduciaires** : profession conservatrice, cycle de décision long
- **Concurrence d'un acteur établi** (Bexio, Klara) qui pivote vers les fiduciaires

### 11.2 Risque produit
- **Qualité IA insuffisante** sur les cas réels diversifiés
- **Friction d'adoption côté clients finaux** (contacts RH PME)

### 11.3 Risque technique
- **Conformité nLPD** : un cas refusé bloque tout un segment
- **Limites Supabase à grande échelle** : refonte nécessaire passé 200 cabinets

### 11.4 Risque commercial
- **CAC trop élevé** : si self-service ne convertit pas, besoin de sales team coûteuse
- **Sous-pricing** : si on s'aligne sur Bexio (~50 CHF/mois), pas de marge

Stratégies de mitigation documentées dans `docs/roadmap.md`.

## 12. Vision long terme (5 ans)

**ZARYA devient le système nerveux des cabinets fiduciaires en Suisse.**

À 5 ans :
- 500+ cabinets clients (≈ 20% du marché suisse)
- Couverture FR/DE/IT
- Intégrations natives avec tous les logiciels métier majeurs
- Modèle IA propriétaire fine-tuné sur le corpus fiduciaire suisse
- Plateforme : les cabinets construisent dessus (API, marketplace, workflows custom)
- Marque référence en Suisse pour "fiduciaire moderne"

À 10 ans (vision audacieuse) :
- Expansion européenne (FR, BE, LU)
- Verticales adjacentes (avocats, family offices)
- Acquisition possible par un acteur de l'écosystème compta/fiscalité OU IPO

## 13. Inspirations et anti-modèles

### 13.1 Inspirations
- **Notion** : flexibilité produit + onboarding self-service réussi
- **Linear** : opinion forte sur l'UX, microcopy excellente
- **Stripe** : documentation exemplaire, focus dev experience
- **Bexio** : ancrage local suisse réussi
- **Pennylane** (FR) : copilote pour comptables, levée massive

### 13.2 Anti-modèles
- **Outils legacy fiduciaires** : interface années 2000, pas d'IA
- **Saas américains B2B agressifs** : pricing opaque, fonctionnalités cachées derrière le sales
- **Outils "tout-en-un" mais "rien-fait-bien"** : ZARYA reste focus sur l'orchestration, pas le calcul
