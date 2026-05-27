---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: ref
type: navigation
referenced_by: [_index, security-and-audit]
---

# Conformité ZARYA

> Navigation centrale pour tout ce qui touche au cadre légal et aux certifications. Ces documents complètent [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md).

## 1. Cadres applicables

| Cadre | Applicabilité ZARYA | Statut documentaire |
|---|---|---|
| **nLPD** (Suisse) | Obligatoire — données fiduciaires CH | ✅ Documenté |
| **RGPD** (UE) | Obligatoire — employés/résidents UE | ✅ Documenté |
| **Secret professionnel fiduciaire** | Indirect — sous-traitance fiduciaire | ✅ Documenté |
| **SOC 2 Type I** (US standard) | Recommandé Phase 2 | 🟡 Planifié |
| **ISO 27001** | Optionnel Phase 3+ | 🟡 Roadmap |

## 2. Documents de ce dossier

| Document | Description | Priorité | Quand |
|---|---|---|---|
| [`registre-traitements.md`](./registre-traitements.md) | Inventaire RGPD des traitements de données | P0 | Avant 1er client payant |
| [`politique-confidentialite.md`](./politique-confidentialite.md) | Page publique pour les utilisateurs | P0 | Avant lancement public |
| [`cgu.md`](./cgu.md) | Conditions générales d'utilisation | P0 | Avant 1er client payant |
| [`sous-traitants.md`](./sous-traitants.md) | Inventaire des sous-traitants avec DPA | P1 | Avant 5e client payant |
| [`droits-personnes.md`](./droits-personnes.md) | Procédure d'exercice des droits RGPD/nLPD | P1 | Avant 5e client payant |
| [`dpa-template.md`](./dpa-template.md) | Modèle de contrat de sous-traitance | P1 | Avant 5e client payant |
| [`notification-violation.md`](./notification-violation.md) | Procédure 72h de notification de violation | P1 | Avant production |
| [`iso-27001-roadmap.md`](./iso-27001-roadmap.md) | Plan vers certification ISO 27001 | P2 | À 50+ cabinets |

## 3. Liens avec le reste de la doc

- **Architecture sécurité** : [`/docs/architecture/security-and-audit.md`](../architecture/security-and-audit.md)
- **Résidence des données** : [`/docs/architecture/data-residency.md`](../architecture/data-residency.md) + [ADR 0001](../architecture/decisions/0001-residence-donnees.md)
- **Audit log** : `audit.*` schémas Postgres dans [`security-and-audit.md` § 8](../architecture/security-and-audit.md)
- **Multi-tenant et isolation** : [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md)

## 4. Workflow conformité au sein de l'équipe

### À chaque nouvelle feature
- [ ] Vérifier impact sur `registre-traitements.md`
- [ ] Si nouveau type de donnée personnelle → mise à jour du registre
- [ ] Si nouveau sous-traitant → DPA + mise à jour `sous-traitants.md`

### À chaque incident
- [ ] Évaluer si "violation" au sens RGPD/nLPD
- [ ] Si oui → activation `notification-violation.md`
- [ ] Logger dans `audit.*`

### À chaque demande utilisateur
- [ ] Identifier le type de demande (accès, rectification, suppression, portabilité, opposition)
- [ ] Appliquer la procédure `droits-personnes.md`
- [ ] Logger l'exercice du droit dans `audit.*`

## 5. Recommandations stratégiques

### Phase 1 (MVP)
- Documents P0 rédigés et validés juriste
- Pas de certification formelle (coût prématuré)
- Argumentaire commercial : "Conformité nLPD + RGPD by design, résidence UE"

### Phase 2 (20-30 cabinets payants)
- Documents P1 rédigés et signés (DPA avec tous les sous-traitants)
- Évaluation SOC 2 Type I (15-25K CHF investis, reconnu SaaS B2B)
- Pen test annuel

### Phase 3 (100+ cabinets)
- SOC 2 Type II
- Démarrage roadmap ISO 27001 si segment Enterprise

### Phase 4+
- ISO 27001 certifié
- Conformité multi-juridictionnelle (DE, FR, IT, BE)

## 6. Coûts estimés

| Item | Coût indicatif |
|---|---|
| Validation juridique P0 docs (juriste suisse spécialisé) | 2-3 K CHF |
| Validation juridique P1 docs (incluant DPA) | 3-5 K CHF |
| Pen test annuel (Phase 2) | 5-10 K CHF |
| Certification SOC 2 Type I | 15-25 K CHF |
| Certification SOC 2 Type II | 30-50 K CHF |
| Certification ISO 27001 initiale | 30-80 K CHF |
| Maintenance ISO 27001 annuelle | 10-20 K CHF |
| DPO externe (Phase 2+) | 500-1500 CHF/mois |

## 7. À tenir à jour

Tout ajout/modification structurante dans ce dossier doit être notifié à l'équipe et validé par un juriste avant publication ou utilisation contractuelle.

Modification du `registre-traitements.md` à chaque évolution produit qui touche aux données personnelles.
