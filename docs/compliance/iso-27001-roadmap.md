---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P2
type: compliance
depends_on: [security-and-audit, roadmap]
referenced_by: [_index, roadmap]
---

# Roadmap ISO 27001

> Plan de progression vers une éventuelle certification ISO 27001 pour ZARYA. **Document stratégique**, à activer à partir de Phase 3 (50+ cabinets payants).

## 1. Contexte et décision

### 1.1 Pourquoi ISO 27001 ?
ISO 27001 est la norme internationale de référence pour les Systèmes de Management de la Sécurité de l'Information (SMSI). Bénéfices potentiels pour ZARYA :
- **Différenciation commerciale** sur le segment Enterprise
- **Confiance accrue** des cabinets exigeants
- **Réponse aux due diligence** d'investisseurs / clients enterprise
- **Cadre méthodologique** pour la sécurité (au-delà du checkbox)

### 1.2 Pourquoi pas tout de suite ?
- **Coût significatif** : 30-80K CHF pour la certification initiale, 10-20K CHF/an de maintenance
- **Investissement temps** : 6-12 mois de préparation (1 ETP dédié)
- **Pas attendue par les cabinets PME** au MVP
- **SOC 2 Type I** est probablement un meilleur ROI au démarrage (15-25K CHF, reconnu SaaS B2B)

### 1.3 Stratégie recommandée
- **Phase 1 (MVP)** : conformité nLPD/RGPD documentée + sécurité by design
- **Phase 2** : SOC 2 Type I (premier signal externe de sécurité formalisée)
- **Phase 3** : SOC 2 Type II (continuité dans le temps)
- **Phase 4** : ISO 27001 si segment Enterprise prouve son potentiel

Document à activer **à partir de Phase 3** (M18-M24).

## 2. Vue d'ensemble ISO 27001

### 2.1 Structure de la norme
ISO 27001:2022 (dernière version) repose sur :
- **Le SMSI** : organisation, processus, documentation
- **L'Annexe A** : 93 contrôles répartis en 4 catégories (organisationnels, personnes, physiques, technologiques)

### 2.2 Différence avec SOC 2
| Aspect | SOC 2 | ISO 27001 |
|---|---|---|
| Origine | US (AICPA) | Internationale (ISO) |
| Approche | Rapport d'audit | Certification |
| Périmètre | 5 critères au choix | SMSI complet |
| Renouvellement | Annuel | 3 ans (audits de surveillance annuels) |
| Coût initial | 15-50K CHF | 30-80K CHF |
| Coût annuel | 10-25K CHF | 10-20K CHF |
| Reconnaissance | Excellente en SaaS US/UE | Excellente internationale, surtout Enterprise/secteur public |

### 2.3 Compatibilité
**Bonne nouvelle** : la majorité des contrôles ISO 27001 sont déjà adressés ou prévus dans `/docs/architecture/security-and-audit.md`. Le travail consiste surtout à **formaliser** plutôt que tout réinventer.

## 3. Évaluation préliminaire

### 3.1 Contrôles déjà couverts (estimation initiale)

#### Contrôles organisationnels (37 contrôles, Annexe A.5)
- ✅ Politiques de sécurité documentées (`security-and-audit.md`)
- ✅ Rôles et responsabilités (RBAC, DPO)
- ✅ Contrats avec sous-traitants (DPA en cours)
- ⚠️ Politique formelle de classification de l'information (à créer)
- ⚠️ Gestion des incidents (procédure créée mais à formaliser SMSI)
- ⚠️ Conformité (RGPD/nLPD couverts, ISO à ajouter)
- ❌ Politique d'audit interne formelle (à créer)

**Estimation** : ~60% couverts

#### Contrôles personnes (8 contrôles, Annexe A.6)
- ✅ Vérification d'antécédents pour les nouveaux employés (à formaliser)
- ✅ Conditions d'emploi (NDA dans contrats)
- ⚠️ Formation et sensibilisation sécurité (à formaliser annuellement)
- ⚠️ Processus disciplinaire (à formaliser)
- ✅ Confidentialité

**Estimation** : ~70% couverts

#### Contrôles physiques (14 contrôles, Annexe A.7)
- ✅ Quasi tout délégué à AWS/Supabase (certifications héritées)
- ✅ Pas de bureau physique à protéger fortement (remote-first)

**Estimation** : ~90% couverts (avantage du cloud-native)

#### Contrôles technologiques (34 contrôles, Annexe A.8)
- ✅ Authentification (Supabase Auth + 2FA)
- ✅ Cryptographie (TLS, AES, Vault)
- ✅ Sécurité réseau (RLS, VPC)
- ✅ Logging et monitoring (`audit.*`)
- ✅ Backups (Supabase quotidien + PITR)
- ⚠️ Gestion des vulnérabilités (Dependabot OK, mais formaliser le process)
- ⚠️ Tests de sécurité (pen test à partir de Phase 2)
- ❌ Disaster Recovery Plan formel (à créer)

**Estimation** : ~70% couverts

### 3.2 Score global estimé
**70-80% des contrôles sont déjà partiellement ou totalement couverts.** Le travail consiste à formaliser, documenter et démontrer le reste.

## 4. Plan de mise en œuvre (12-18 mois)

### Phase A — Préparation (M0-M3)
**Objectif** : poser les fondations du SMSI

Activités :
- [ ] Engagement de la direction (politique signée)
- [ ] Désignation d'un Responsable SMSI (peut être DPO)
- [ ] Définition du périmètre (probablement : tout ZARYA)
- [ ] Inventaire des actifs (extension de `sous-traitants.md` + données + applications)
- [ ] Analyse de risque formelle (à compléter)
- [ ] Sélection d'un cabinet d'audit (au moins 3 devis)

Livrables :
- Politique de sécurité signée par la direction
- Inventaire des actifs documenté
- Analyse de risque formelle

### Phase B — Conception du SMSI (M3-M6)
**Objectif** : définir tous les processus et politiques

Activités :
- [ ] Politique de classification de l'information
- [ ] Politique de gestion des accès
- [ ] Politique de gestion des changements
- [ ] Politique de gestion des incidents
- [ ] Plan de continuité d'activité (PCA)
- [ ] Plan de reprise d'activité (PRA / DRP)
- [ ] Procédure d'audit interne
- [ ] Procédure de revue de direction

Livrables :
- Manuel du SMSI complet
- Toutes les politiques formelles

### Phase C — Mise en œuvre (M6-M9)
**Objectif** : appliquer concrètement

Activités :
- [ ] Formation sécurité de toute l'équipe (annuelle)
- [ ] Test du PCA/PRA
- [ ] Pen test (si pas déjà fait Phase 2)
- [ ] Audit interne par tiers indépendant
- [ ] Corrections des non-conformités identifiées
- [ ] Revue de direction

Livrables :
- Rapport d'audit interne
- Plan d'actions correctives
- Revue de direction documentée

### Phase D — Pré-audit (M9-M12)
**Objectif** : se préparer à l'audit de certification

Activités :
- [ ] Pré-audit par le cabinet certificateur (étape 1 - revue documentaire)
- [ ] Corrections des non-conformités majeures
- [ ] Préparation des preuves pour chaque contrôle

Livrables :
- Toutes les preuves opérationnelles
- Documentation complète à jour

### Phase E — Audit de certification (M12)
**Objectif** : obtenir la certification

Activités :
- [ ] Audit de certification (étape 2 - sur site/à distance)
- [ ] Réponse aux remarques
- [ ] Obtention du certificat

Livrables :
- **Certificat ISO 27001:2022**

### Phase F — Maintenance (M12+)
**Objectif** : maintenir la certification

Activités annuelles :
- [ ] Audit de surveillance (par le certificateur)
- [ ] Audit interne
- [ ] Revue de direction
- [ ] Mise à jour des politiques
- [ ] Formation continue

Activités à 3 ans :
- [ ] Audit de renouvellement complet

## 5. Inventaire actuel des actifs

À détailler en Phase A. Ébauche :

### 5.1 Actifs information
- Données clients (cabinets et leurs clients)
- Code source ZARYA
- Documentation produit
- Données opérationnelles (logs, métriques)
- Secrets (clés API, mots de passe)

### 5.2 Actifs technologiques
- Infrastructure AWS (compte ZARYA + Supabase)
- Domaines (zarya.ch et autres)
- Comptes GitHub, Vercel, Stripe, etc.
- Devices équipe (laptops, téléphones)

### 5.3 Actifs humains
- Membres équipe ZARYA
- Sous-traitants techniques
- Conseillers externes

## 6. Analyse de risque méthodologie

### 6.1 Approche recommandée
- **Méthode** : ISO 27005 ou EBIOS Risk Manager
- **Critères** : probabilité × impact
- **Échelle** : 1 à 5 sur chaque axe

### 6.2 Risques majeurs identifiés (à formaliser)
1. **Fuite cross-tenant** : impact 5, probabilité 2 → risque 10
2. **Compromission compte admin** : impact 5, probabilité 3 → risque 15
3. **Compromission sous-traitant critique** : impact 5, probabilité 2 → risque 10
4. **Ransomware** : impact 5, probabilité 2 → risque 10
5. **Erreur de migration DB** : impact 4, probabilité 3 → risque 12
6. **Vol de credentials sous-traitant** : impact 4, probabilité 3 → risque 12
7. **Fraude au RIB côté client** : impact 4, probabilité 4 → risque 16 (mais responsabilité côté cabinet)
8. **Indisponibilité prolongée** : impact 4, probabilité 2 → risque 8

### 6.3 Traitement du risque
Pour chaque risque > seuil (à définir, ex. 10) :
- **Accepter** (si coût mitigation > impact attendu)
- **Réduire** (mesures techniques/organisationnelles)
- **Transférer** (assurance cyber)
- **Éviter** (cesser l'activité concernée)

## 7. Politiques à créer ou formaliser

| Politique | Statut actuel | Action |
|---|---|---|
| Politique de sécurité globale | ✅ couverte en partie par security-and-audit.md | Formaliser et faire signer |
| Politique de classification de l'information | ❌ à créer | Créer |
| Politique de gestion des accès | ✅ partielle (RBAC) | Formaliser document dédié |
| Politique de mot de passe | ✅ couverte | Document dédié |
| Politique d'utilisation acceptable | ❌ à créer | Créer |
| Politique BYOD | ❌ à créer (si applicable) | Créer ou exclure |
| Politique de gestion des incidents | ✅ couverte par notification-violation.md | Étendre au-delà des violations |
| Politique de gestion des sous-traitants | ✅ couverte par sous-traitants.md | OK |
| Politique de continuité d'activité | ❌ à créer | Créer (PCA + PRA) |
| Politique de gestion des changements | ⚠️ implicite | Formaliser |
| Politique de cryptographie | ✅ couverte | Document dédié |
| Politique de classification des actifs | ❌ à créer | Créer |

## 8. Coûts estimés (sur 18 mois)

| Poste | Coût |
|---|---|
| Conseil externe (préparation) | 15-30 K CHF |
| Pen test | 5-10 K CHF |
| Audit interne (tiers) | 5-10 K CHF |
| Pré-audit cabinet certificateur | 5-10 K CHF |
| Audit de certification (étapes 1+2) | 10-25 K CHF |
| Formation équipe | 3-5 K CHF |
| Temps interne (1 ETP partiel 18 mois) | 80-120 K CHF |
| **Total préparation + certification** | **120-210 K CHF** |
| Maintenance annuelle (audit + temps interne) | 30-50 K CHF |

⚠️ Investissement significatif. Justifié uniquement si :
- ARR > 1M CHF
- Segment Enterprise prouvé (5+ cabinets > 10 K CHF/mois)
- Demande explicite et récurrente des prospects

## 9. Alternative recommandée — SOC 2

### 9.1 Pourquoi SOC 2 d'abord
- **Coût** : 3x moins cher
- **Délai** : 6 mois vs 18 mois
- **Reconnaissance** : excellente dans le SaaS B2B
- **Critères ciblés** : on choisit les domaines pertinents (sécurité minimum, ajout confidentialité/disponibilité)

### 9.2 SOC 2 Type I vs Type II
- **Type I** : photo à un instant T (un point dans le temps)
- **Type II** : observation sur 6-12 mois (plus solide)

Recommandation :
- **Phase 2** : SOC 2 Type I (15-25 K CHF, 4-6 mois)
- **Phase 3** : SOC 2 Type II (30-50 K CHF, 6-12 mois)
- **Phase 4** : ISO 27001 si justifié

### 9.3 Compatibilité SOC 2 → ISO 27001
Beaucoup de contrôles se recoupent. SOC 2 est une **excellente préparation** à ISO 27001.

## 10. Recommandation finale

### 10.1 Court terme (Phase 1 — MVP)
- Pas de certification formelle
- Conformité nLPD/RGPD documentée et auditée par juriste (2-3 K CHF)
- Argumentaire commercial : "Conformité by design, résidence UE, audit complet"

### 10.2 Moyen terme (Phase 2 — 20-30 cabinets)
- **SOC 2 Type I** comme première certification (15-25 K CHF)
- Préparation aux exigences enterprise

### 10.3 Long terme (Phase 3 — 100+ cabinets)
- **SOC 2 Type II** (renforcement de la maturité)
- Évaluation d'ISO 27001 si demande clients enterprise

### 10.4 Très long terme (Phase 4 — segment Enterprise mature)
- **ISO 27001** si segment Enterprise > 30% du CA
- Maintien parallèle SOC 2 pour reconnaissance internationale

## 11. Quand activer ce document

Ce document reste **dormant** jusqu'aux conditions suivantes :
- ✅ ARR > 1M CHF
- ✅ Au moins 5 cabinets Enterprise actifs
- ✅ Au moins 3 demandes explicites de prospects pour ISO 27001
- ✅ Équipe stable de 10+ personnes
- ✅ Capital disponible pour investir 150-200 K CHF sur 18 mois

Si ces conditions ne sont pas remplies, **rester sur la trajectoire SOC 2** est plus pertinent.

## 12. Documents associés

- [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md) — base technique
- [`/docs/compliance/registre-traitements.md`](./registre-traitements.md) — inventaire des traitements
- [`/docs/compliance/sous-traitants.md`](./sous-traitants.md) — inventaire des sous-traitants
- [`/docs/compliance/notification-violation.md`](./notification-violation.md) — gestion incidents
- [`/docs/roadmap.md`](../roadmap.md) — articulation avec la roadmap business

## 13. À tenir à jour

Ce document est révisé :
- Annuellement (alignement avec la roadmap business)
- À chaque évolution majeure d'un sous-traitant
- Si une demande Enterprise change le timing

Activation décidée en réunion de direction trimestrielle.
