---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: ref
type: foundation
depends_on: [vision, personas, pricing]
referenced_by: [vision, README]
---

# Roadmap ZARYA

> Vision séquencée : phases de développement, livrables par phase, jalons business. Document vivant, à réviser trimestriellement.

## 1. Vue d'ensemble

```
Phase 0 — Validation marché          [Maintenant — M2]
Phase 1 — MVP P0                     [M2 — M6]
Phase 2 — Différenciation P1         [M6 — M12]
Phase 3 — Verticalisation P2         [M12 — M24]
Phase 4 — Écosystème                 [M24+]
```

Chaque phase a :
- Un objectif business clair
- Des livrables produit identifiés
- Des indicateurs de succès quantifiés
- Des conditions de passage à la phase suivante

## 2. Phase 0 — Validation marché [Maintenant — M2]

### 2.1 Objectif
**Valider l'existence et l'intensité des douleurs** identifiées avant d'investir dans le développement.

### 2.2 Activités principales
- 10-15 interviews qualitatives fiduciaires (voir [`/docs/validation/interview-guide.md`](./validation/interview-guide.md))
- Identification de 3-5 cabinets pilotes potentiels
- Synthèse des apprentissages dans [`synthesis.md`](./validation/synthesis.md)
- Ajustement de la vision et des modules selon les retours
- Setup juridique : structure d'entreprise, CGU, politique de confidentialité

### 2.3 Livrables
- Documentation produit complète (en cours)
- 10-15 transcripts d'interviews documentés
- Synthèse marché actualisée
- Liste de 3-5 cabinets pilotes engagés (lettre d'intention)
- Wireframes des écrans clés
- Site landing simple présentant la vision

### 2.4 Indicateurs de succès
- ✓ 10+ interviews complétées
- ✓ 3+ douleurs majeures validées avec quantification
- ✓ 3+ cabinets pilotes prêts à tester
- ✓ Willingness to pay confirmée à au moins 199 CHF/mois

### 2.5 Conditions de passage à Phase 1
- Au moins 3 cabinets pilotes engagés
- Vision et modules validés ou ajustés
- Setup juridique complet (entreprise, contrats)
- Équipe technique en place (au moins 1 dev senior + Tristan)

### 2.6 Risques
- Interviews révèlent que les douleurs ne sont pas si intenses
- Concurrence émergente identifiée
- Difficulté à trouver des cabinets pilotes
- Pricing perçu comme trop élevé

**Mitigation** : si interviews très négatives, pivot ou abandon. Si pricing inadapté, ajustement du modèle économique.

---

## 3. Phase 1 — MVP P0 [M2 — M6]

### 3.1 Objectif
**Construire le MVP capable d'opérer 3 cabinets pilotes** sur la boucle de valeur courte (onboarding → opérations mensuelles).

### 3.2 Modules livrés

| Module | Statut | Sprint cible |
|---|---|---|
| Onboarding Fiduciaire (self-service) | À développer | M2-M3 |
| Onboarding Client (assisté IA) | À développer | M2-M3 |
| Dashboard Client (mobile-first) | À développer | M3-M4 |
| Zarya Doc (inbox + classification) | À développer | M3-M4 |
| Zarya CRM (centre de vérité) | À développer | M2-M4 |
| Zarya Calendar (échéances + relances) | À développer | M4-M5 |
| Brique Extraction IA | À développer | M2-M3 |

### 3.3 Intégrations livrées
- Microsoft Graph (email + calendar)
- Zefix
- Bedrock + Mistral OCR
- Supabase + Stripe
- NAS (lecture seule)

### 3.4 Modules **non** livrés en Phase 1
- Zarya Facture (P1 → Phase 2)
- Zarya Search (P1 → Phase 2)
- Zarya Salaire complet (P2 → Phase 3)
- Connecteurs natifs Bexio Payroll
- Option Suisse stricte

### 3.5 Indicateurs de succès
- ✓ 3 cabinets pilotes onboardés et opérationnels
- ✓ Boucle complète : onboarding fiduciaire → onboarding client → 1er cycle mensuel
- ✓ Au moins 10 clients PME actifs sur les 3 cabinets cumulés
- ✓ Au moins 500 documents ingérés et classés
- ✓ NPS responsables cabinets > 30
- ✓ Au moins 70% des contacts RH PME se connectent au dashboard

### 3.6 Conditions de passage à Phase 2
- 3 cabinets pilotes actifs et engagés
- Feedback structuré collecté
- Backlog Phase 2 priorisé selon les retours
- Architecture éprouvée à petite échelle
- Équipe étoffée (2-3 devs + 1 designer + Tristan)

### 3.7 Risques
- Retard sur les développements (modules complexes)
- Adoption faible côté contact RH client (dashboard)
- Qualité IA insuffisante sur les cas réels
- Onboarding fiduciaire trop friction-heavy

**Mitigation** :
- Buffer 30% sur les estimations dev
- A/B testing UI dashboard client dès que possible
- Itérations rapides sur les prompts IA avec feedback pilotes
- Mode "guided onboarding" avec assistance ZARYA si self-service bloque

---

## 4. Phase 2 — Différenciation P1 [M6 — M12]

### 4.1 Objectif
**Atteindre le product-market fit** avec 20-30 cabinets payants. Différencier ZARYA via les modules à forte valeur (Search, Facture).

### 4.2 Modules livrés

| Module | Sprint cible |
|---|---|
| Zarya Search (RAG avec sources) | M6-M8 |
| Zarya Facture (extraction + export) | M7-M9 |
| Connecteur API Bexio Payroll | M9-M10 |
| Option Suisse stricte (Azure Switzerland North) | M10-M11 |
| Améliorations Doc (auto-classement, règles apprises) | M6-M9 |
| Améliorations Calendar (auto-envoi optionnel) | M7-M9 |

### 4.3 Intégrations supplémentaires
- Bexio Compta API (factures fournisseurs)
- Bexio Payroll API (employés et bulletins)
- Webhooks publics ZARYA (Phase 2 fin)

### 4.4 Améliorations transverses
- Personnalisations cabinet plus poussées (modèles d'emails customs, branding avancé)
- Analytics produit Posthog en prod
- 2FA obligatoire pour les rôles sensibles
- Plan annuel disponible (-15%)
- Tests automatisés étendus

### 4.5 Indicateurs de succès
- ✓ 20-30 cabinets payants actifs
- ✓ MRR > 10K CHF
- ✓ Taux de conversion essai → payant > 25%
- ✓ Churn annuel < 10%
- ✓ NPS > 40
- ✓ Volume LLM stable (pas d'explosion de coûts)

### 4.6 Conditions de passage à Phase 3
- 20+ cabinets actifs en plan Pro
- Au moins 1 cabinet en plan Enterprise
- ARR > 100K CHF
- Architecture éprouvée à moyenne échelle
- Équipe stable (4-6 personnes)

### 4.7 Risques
- Coûts LLM imprévus à grande échelle
- Limites Supabase atteintes prématurément
- Concurrence d'un acteur établi qui pivote
- Burnout équipe

**Mitigation** :
- Monitoring coûts LLM par cabinet, quotas hard si abus
- Plan de migration vers Supabase Enterprise prêt
- Veille concurrentielle active, agilité de pivot
- Embauche progressive, processus agile

---

## 5. Phase 3 — Verticalisation P2 [M12 — M24]

### 5.1 Objectif
**Devenir leader Suisse romande** des outils fiduciaires modernes. 100+ cabinets actifs. Expansion régionale.

### 5.2 Modules livrés

| Module | Sprint cible |
|---|---|
| Zarya Salaire complet (cycle mensuel + Swissdec ELM) | M12-M16 |
| Connecteurs natifs Crésus, Abacus, WinBIZ | M14-M20 |
| Expansion DE/IT (i18n complète, équipe locale) | M16-M22 |
| Module conformité avancée (audit log avancé, exports formaux) | M18-M22 |
| Module facturation client (le cabinet facture ses PME via ZARYA) | M14-M18 |

### 5.3 Améliorations
- ML fine-tuning sur les corpus fiduciaires anonymisés
- Connecteurs banques (open banking, EBICS)
- Workflow de validation multi-niveaux
- Calendrier cantonal officiel synchronisé
- App mobile native (iOS + Android) — à valider en interview

### 5.4 Indicateurs de succès
- ✓ 100+ cabinets payants actifs
- ✓ MRR > 50K CHF
- ✓ ARR > 600K CHF
- ✓ Première présence en Suisse alémanique (5+ cabinets)
- ✓ Rentabilité opérationnelle atteinte
- ✓ NPS > 50

### 5.5 Conditions de passage à Phase 4
- Position de leader établie en Suisse romande
- Modèle économique éprouvé
- Capacité à racheter ou être racheté (Phase 4 = écosystème)
- Équipe consolidée (10-15 personnes)

### 5.6 Risques
- Croissance trop rapide qui dégrade la qualité
- Coûts d'expansion DE/IT plus élevés que prévu
- Concurrence locale en Suisse alémanique
- Évolutions réglementaires nLPD

**Mitigation** :
- Politique de qualité produit explicite
- Approche progressive de l'expansion (1 ville à la fois)
- Partenariats locaux pour accélérer
- Veille juridique active

---

## 6. Phase 4 — Écosystème [M24+]

### 6.1 Objectif
**Plateforme** sur laquelle d'autres acteurs construisent. Acquisition possible ou IPO horizon 5-10 ans.

### 6.2 Initiatives

**API publique**
- Documentation complète
- Sandbox developers
- Plans tarifaires API
- Marketplace de developers

**Marketplace de templates**
- Les cabinets partagent leurs configurations (checklists, modèles emails)
- Système d'évaluation et de recommandation
- Royalties pour les contributeurs

**Connecteurs partenaires**
- Banques (UBS, Credit Suisse, banques cantonales)
- Assurances
- Logiciels métier internationaux

**Verticales adjacentes**
- Avocats fiscalistes
- Family offices
- Asset managers

**Expansion européenne**
- France, Belgique, Luxembourg (marchés similaires)
- Adaptation aux spécificités locales

### 6.3 Indicateurs de succès
- ✓ 300+ cabinets en Suisse
- ✓ ARR > 5M CHF
- ✓ Marketplace active (50+ templates publics)
- ✓ Premiers cabinets en FR/BE/LU
- ✓ EBITDA positif

### 6.4 Options stratégiques

À cette étape, plusieurs voies possibles :

**Voie A — Bootstrap continu**
- Croissance organique, profitable
- Indépendance préservée
- Croissance plus lente mais maîtrisée

**Voie B — Levée de fonds Series A/B**
- Accélération expansion européenne
- Embauche massive
- Risque de dilution et de pression VC

**Voie C — Acquisition stratégique**
- Par un acteur de l'écosystème (Bexio, Klara, comptable software global)
- Par un fond
- Par un grand groupe fiduciaire

**Voie D — IPO**
- Horizon 7-10 ans minimum
- Marché public local (SIX Swiss Exchange) ou européen

Décision à prendre selon la conjoncture, les ambitions et les opportunités.

## 7. Jalons business clés

| Jalon | Cible | Calendrier estimé |
|---|---|---|
| 1er cabinet pilote actif | 1 | M3 |
| 1er cabinet payant | 1 | M6 |
| MRR 10K CHF | — | M9-M12 |
| MRR 50K CHF | — | M18-M24 |
| MRR 100K CHF | — | M24-M30 |
| Break-even opérationnel | — | M18-M24 |
| 100 cabinets actifs | 100 | M24 |
| ARR 1M CHF | — | M30-M36 |
| Expansion DE | 5+ cabinets DE | M24 |
| Première levée | optionnelle | M18-M24 si voulu |

## 8. Roadmap technique transverse

### 8.1 Performance et scalabilité
- M0-M6 : optimisation Postgres, RLS performance
- M6-M12 : monitoring fin, alertes pro-actives
- M12-M18 : éventuelle migration Supabase Enterprise
- M18-M24 : préparation multi-region

### 8.2 Sécurité
- M0-M6 : sécurité by design, tests d'isolation
- M6-M12 : pen test annuel
- M12-M24 : préparation certifications (ISO 27001 envisagée)
- M24+ : audit régulier, programme bug bounty

### 8.3 Conformité
- M0-M6 : nLPD + RGPD by design
- M6-M12 : DPO externe consulté périodiquement
- M12-M18 : revue annuelle conformité
- M18-M24 : préparation expansion DE/IT (équivalents réglementaires)

### 8.4 IA et ML
- M0-M6 : prompts versionnés, evals manuels
- M6-M12 : evals automatisées en CI, A/B testing prompts
- M12-M18 : exploration fine-tuning sur corpus anonymisé
- M18+ : potentiel modèle propriétaire si ROI clair

## 9. Hypothèses critiques à valider

Cette roadmap repose sur :
1. **Marché** : 5000+ fiduciaires en Suisse, 2000+ en Romandie potentiellement adressables
2. **Pricing** : 199-499 CHF accepté par cible
3. **Adoption** : self-service marche pour 70%+ des cabinets cibles
4. **IA** : précision suffisante (>90% sur les cas standards)
5. **Équipe** : capacité à recruter en Suisse romande dev senior + designer + sales
6. **Capital** : bootstrap possible jusqu'à M12-M18, levée optionnelle au-delà

Chaque hypothèse mérite un suivi dédié et un plan B si invalidée.

## 10. Anti-roadmap

Ce qui n'est **pas** sur la roadmap, et pourquoi :

| Initiative | Raison de l'exclusion |
|---|---|
| App mobile native MVP | PWA suffit, complexité disproportionnée |
| Marketplace de devs (avant Phase 4) | Prématuré sans ARR significatif |
| Expansion FR/EU avant Phase 4 | Concentration Suisse d'abord |
| AI agents autonomes | Risque produit majeur, pas le moment |
| Tokenisation, blockchain | Hors-sujet métier |
| Crypto payments | Pas demandé par la cible |
| Social features | Pas notre métier |
| Free tier permanent | Coûts LLM imprévisibles, voir [`pricing.md`](./pricing.md) |

## 11. Revisions de la roadmap

Cette roadmap est révisée :
- **Trimestriellement** : ajustement des sprints et priorités
- **Annuellement** : revue stratégique complète
- **Sur événement** : pivot majeur, retours pilotes, opportunité commerciale

Versions précédentes archivées dans Git.

## 12. Risques transverses

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Concurrent établi pivote (Bexio fiduciaires) | Moyenne | Élevé | Avance time-to-market, exclusivités cabinets pilotes |
| nLPD durcie | Faible | Élevé | Veille juridique active, conformité au-delà du minimum |
| Coûts LLM explosent | Moyenne | Moyen | Quotas, optimisation prompts, fine-tuning futur |
| Recrutement difficile en Romandie | Élevée | Moyen | Remote-first, partenariats écoles, sourcing actif |
| Échec PMF Phase 1 | Moyenne | Critique | Pivot rapide, capital préservé pour itération |

## 13. À tenir à jour

Ce document est révisé à chaque sprint planning trimestriel. Modifications structurantes documentées en ADR.

Version actuelle : **v0.1** — Mai 2026.
