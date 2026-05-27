---
status: accepted
date: 2026-05-26
deciders: [tristan]
referenced_by: [stack, multi-tenant, dev-environment]
---

# ADR 0004 — Supabase Cloud vs self-hosted Postgres

## Statut
Acceptée — 26 mai 2026

## Contexte

Choix de la stratégie de gestion de la base de données et services associés (auth, storage, realtime). Décision avec impact opérationnel fort.

Options évaluées :

1. **Supabase Cloud** : SaaS managé sur AWS, plan Pro à $25/mois
2. **Supabase self-hosted** : déploiement Docker/Kubernetes sur AWS ou autre cloud
3. **Postgres pur sur RDS / Aurora** : pas de couche Supabase, auth/storage custom
4. **Neon ou PlanetScale** : Postgres serverless

## Décision

**Supabase Cloud Pro hébergé en eu-central-1 (Frankfurt).**

Pour le MVP et jusqu'à au moins 100 cabinets actifs. Migration possible vers Supabase Enterprise ou self-hosted en Phase 3 si besoin.

## Raisons

### Pourquoi Supabase Cloud
- **Stack complète managée** : Postgres + Auth + Storage + Realtime + Vault + pgvector en une plateforme
- **Hébergement EU** : eu-central-1 (Frankfurt) disponible nativement
- **RLS natif** : critique pour notre architecture multi-tenant (ADR 0005)
- **Migrations versionnées** : CLI excellente pour le workflow dev
- **DX exceptionnel** : dashboard, SQL editor, RLS testing intégré
- **Coût initial très bas** : $25/mois pour démarrer
- **Backups quotidiens** : inclus, PITR sur 7 jours
- **Scale-up progressif** : Pro → Team → Enterprise selon les besoins
- **Conformité** : SOC 2, HIPAA, GDPR documentés

### Pourquoi pas self-hosted MVP
- **Coûts opérationnels** : équipe doit gérer Postgres, backups, monitoring, mises à jour
- **Time-to-market** : 2-4 semaines de setup vs 2 heures avec Supabase Cloud
- **Compétences** : nécessite un DBA / SRE compétent
- **Pas de gain réel** au volume MVP : Supabase Cloud tient largement 100 cabinets

### Pourquoi Supabase et pas Postgres + custom
- **Auth Supabase** déjà excellente (email/mdp, magic links, OAuth, 2FA, JWT)
- **Storage Supabase** = S3 + RLS intégrée, gain de temps massif
- **pgvector inclus** sans configuration supplémentaire
- **Vault** pour chiffrement applicatif
- Faire tout ça à la main = 3-6 mois de dev en plus

## Conséquences

### Positives
- **Démarrage immédiat** : DB opérationnelle en quelques minutes
- **Focus métier** : l'équipe se concentre sur le produit, pas l'infra
- **Coûts maîtrisés** : $25 MVP, montée progressive
- **Conformité simplifiée** : Supabase est SOC 2 / GDPR compliant
- **DX excellent** : dashboard, CLI, types TypeScript générés
- **Migration vers self-hosted possible** : Supabase étant open source, retour en arrière techniquement faisable

### Négatives
- **Vendor lock-in** modéré : utilisation de fonctions Supabase spécifiques (Auth hooks, Vault, Edge Functions Deno)
- **Coûts à l'échelle** : Enterprise peut devenir cher (4-figures/mois) — à anticiper
- **Limites de RLS performance** : à monitorer avec gros volumes (50M+ lignes par table)
- **Dépendance roadmap Supabase** : pas de contrôle sur leurs choix futurs
- **Latency de connection** : un peu plus élevée qu'une DB locale

### Neutres
- Supabase est open source, donc pas de fermeture totale possible
- L'équipe Supabase a une excellente réputation et croissance saine

## Alternatives écartées

### Pourquoi pas self-hosted MVP ?
- Surcharge opérationnelle disproportionnée par rapport au gain
- Manque de DBA dédié dans l'équipe initiale
- À reconsidérer si scaling impose

### Pourquoi pas RDS + custom ?
- Refaire Auth, Storage, Realtime = 6 mois de dev
- Pas de gain économique significatif vs Supabase Cloud avant 1000 cabinets
- DX Supabase incomparable

### Pourquoi pas Neon ?
- Postgres serverless attrayant techniquement
- Mais : pas de couche Auth/Storage intégrée
- Moins mature sur RLS et fonctions avancées
- À surveiller pour Phase 3 si besoin

### Pourquoi pas PlanetScale ?
- MySQL-based historiquement (Vitess), pas Postgres
- Pas de RLS natif compatible avec notre besoin
- PlanetScale a pivoté en 2024, instabilité de l'offre

## Risques mitigés

### Performance RLS à grande échelle
**Mitigation** : monitoring actif des requêtes lentes, partitionnement des grosses tables, possibilité de passer en Enterprise pour ressources dédiées.

### Coûts Enterprise
**Mitigation** : projection des coûts en fonction du nombre de cabinets, plan de migration vers self-hosted documenté si seuil dépassé (~$10K/mois).

### Disponibilité Supabase
**Mitigation** : Supabase a un SLA acceptable, monitoring multi-couches, backups externes possibles pour assurance.

### Évolution des fonctionnalités Supabase
**Mitigation** : utiliser de manière conservative les features récentes, contribuer au projet open source si besoin.

## Conditions de révision

À reconsidérer si :
- > 100 cabinets actifs avec performances dégradées
- Coût Enterprise > $10K/mois (alors comparer avec self-host)
- Besoin réglementaire de contrôle total de l'infra (cabinets Enterprise sensibles)
- Supabase change drastiquement son business model ou est racheté défavorablement

## Plan de migration éventuelle

Si décision de migrer vers self-hosted :
1. Setup Supabase self-hosted en parallèle (Docker compose puis Kubernetes)
2. Réplication Postgres (logical replication)
3. Bascule progressive cabinet par cabinet (faisable car multi-tenant)
4. Backup des assets Storage vers S3 direct
5. Migration des Edge Functions vers ECS

Durée estimée : 2-3 mois pour 100+ cabinets.

## Implémentation

Voir :
- [`/docs/architecture/stack.md`](../stack.md)
- [`/docs/architecture/dev-environment.md`](../dev-environment.md)
- [`/docs/architecture/multi-tenant.md`](../multi-tenant.md) — RLS Supabase utilisée

## Liens connexes

- ADR 0001 — Résidence UE (Supabase EU disponible)
- ADR 0002 — Stack Next.js (Supabase client TypeScript natif)
- ADR 0005 — Multi-tenant natif (RLS Supabase implémentation)
