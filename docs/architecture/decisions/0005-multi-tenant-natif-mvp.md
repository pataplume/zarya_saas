---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [multi-tenant, crm-schema, onboarding-fiduciaire]
---

# ADR 0005 — Multi-tenant natif dès le MVP avec `crm.cabinet` au sommet

## Statut
Acceptée — 26 mai 2026

## Contexte

ZARYA est un SaaS B2B vendu aux cabinets fiduciaires. La question s'est posée d'architecturer le multi-tenant immédiatement ou de reporter à Phase 2.

Options évaluées :

1. **Single-tenant au MVP** : un cabinet par déploiement, refactor multi-tenant plus tard
2. **Multi-tenant natif avec `cabinet_id` partout** : architecture multi-tenant dès le départ
3. **Multi-tenant avec schémas séparés** : un schéma Postgres par cabinet
4. **Multi-tenant avec bases séparées** : une instance Supabase par cabinet

## Décision

**Multi-tenant natif dès le MVP avec `crm.cabinet` au sommet du modèle de données et `cabinet_id` sur toutes les tables métier.**

Stratégie : **shared database, shared schema** avec Row Level Security (RLS) Postgres pour l'isolation.

## Raisons

### Pourquoi multi-tenant dès le MVP
- ZARYA est par nature un SaaS multi-tenant (chaque cabinet est un client payant indépendant)
- Reporter le multi-tenant signifie **refactor majeur** du schéma à Phase 2 (ajout `cabinet_id` partout, RLS, JWT enrichi) — coût bien supérieur à le faire dès le début
- L'onboarding fiduciaire **self-service** acté en ADR 0006 implique nécessairement multi-tenant
- Permet de signer plusieurs cabinets pilotes simultanément sans pivot d'architecture

### Pourquoi `crm.cabinet` (pas un schéma séparé `tenant.*`)
- Le cabinet **est** une entité métier du domaine CRM (avec ses propres clients, contacts, etc.)
- Cohérence : `crm.cabinet` chapeaute `crm.client`, les deux dans le même schéma
- Évite la fragmentation des concepts métier

### Pourquoi shared database / shared schema (pas DB ou schéma par tenant)
- **Simplicité opérationnelle** : 1 base à backup, migrer, monitorer
- **Coût** : 1 instance Supabase au lieu de N
- **Provisioning rapide** : nouveau cabinet = INSERT, pas création de DB
- **Maintenance** : une seule application des migrations
- DB-par-tenant viable seulement pour des cabinets enterprise (Phase 2+)

## Conséquences

### Positives
- **Pas de refactor majeur** à Phase 2 quand on aura 10+ cabinets
- **Onboarding cabinet ultra-rapide** (< 2s pour créer un nouveau cabinet)
- **Templates ZARYA hérités** par tous les cabinets (efficacité produit)
- **Cross-cabinet analytics** possibles (anonymisées)
- **Coûts d'infra mutualisés** sur tous les cabinets

### Négatives
- **Complexité initiale accrue** : chaque table doit avoir `cabinet_id`, chaque policy RLS doit être écrite correctement
- **Tests d'isolation obligatoires** : risque de fuite cross-tenant si une RLS est mal écrite ou oubliée
- **Performance** : RLS ajoute un filtre sur chaque requête (impact mesurable mais acceptable jusqu'à plusieurs millions de lignes)
- **Backups** : restauration sélective d'un cabinet plus complexe que si DB séparée
- **Discipline de code** : tout SELECT applicatif doit faire confiance à la RLS, pas re-filtrer manuellement (sinon on duplique la logique)

### Neutres
- Dénormalisation : `cabinet_id` dupliqué sur les tables filles pour éviter des JOINs dans les RLS
- Cas du contact client (mini-dashboard) : il n'est pas un tenant séparé mais a une RLS spécifique via `salaire.acces_client`

## Alternatives écartées

### Pourquoi pas single-tenant au MVP ?
Vu l'ambition (self-service, plusieurs pilotes en parallèle), reporter le multi-tenant créerait un refactor majeur juste après le MVP. Mieux vaut faire les choses propres dès le départ.

### Pourquoi pas schema-per-tenant ?
- Migrations Postgres N fois plus complexes (forall schema in schemas: apply migration)
- Provisioning d'un cabinet = création de N tables = plusieurs secondes
- Coût opérationnel disproportionné
- Pas d'avantage de sécurité supplémentaire significatif vs RLS bien faite

### Pourquoi pas DB-per-tenant ?
- Coût économique (X instances Supabase à $25/mois)
- Coût opérationnel (X bases à monitorer, backuper, mettre à jour)
- Justifié uniquement pour cabinets exigeant compliance ultra-stricte (à offrir en Enterprise Phase 2+)

## Risques mitigés

### Fuite de données cross-tenant
**Mitigation** : tests d'isolation automatisés dans la CI, code review obligatoire sur tout changement RLS, audits trimestriels.

### Performance sur gros cabinets
**Mitigation** : index sur `cabinet_id` partout, monitoring de la latence par cabinet, plan de migration vers DB-dédiée si un cabinet dépasse les seuils acceptables.

### Discipline développeur
**Mitigation** : helpers internes qui imposent `cabinet_id` (ex. `db.client.findMany()` injecte automatiquement le filtre), revue de code stricte.

## Conditions de révision

À reconsidérer si :
- Un cabinet de très grande taille (5+ associés, 500+ clients) demande une infrastructure dédiée
- Des contraintes réglementaires nouvelles exigent une isolation cryptographique par cabinet
- Performance dégrade significativement avec >100 cabinets actifs (à monitorer)
- Une faille de sécurité cross-tenant est détectée (postmortem + révision)

## Implémentation

Voir [`/docs/architecture/multi-tenant.md`](../multi-tenant.md) pour la mise en œuvre complète :
- Convention `cabinet_id` sur toutes les tables
- Fonction `current_cabinet_id()` pour les RLS
- Policies génériques par table
- Provisioning d'un nouveau cabinet
- Tests d'isolation requis
