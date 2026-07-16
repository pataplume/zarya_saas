---
status: proposed
date: 2026-07-16
deciders: [tristan]
referenced_by: [dev-environment]
---

# ADR 0026 — Source unique des migrations et application automatisée

> **Statut : proposé.** Le rebaseline décrit ici est **destructif pour l'historique** (pas pour les
> données) et ne sera exécuté qu'après validation explicite du founder. Cette ADR pose le constat,
> la cible et le plan ; la PR qui l'introduit ne livre que des outils **non destructifs**
> (script de diagnostic lecture seule + CI d'isolation fail-closed).

## Contexte

ZARYA a aujourd'hui **trois vérités divergentes** sur l'état des migrations (constat
AUDIT-MVP.md § 4/§ 8, chiffres re-vérifiés le 16/07/2026 sur le projet Supabase `zarya_saas`) :

1. **Les fichiers du repo** : **57** fichiers SQL dans `packages/db/migrations/` (`0000` → `0055`),
   avec une **collision de numérotation** — deux `0001_*` (`0001_rls_cabinet.sql` et
   `0001_sloppy_vengeance.sql`).
2. **Le journal Drizzle** (`packages/db/migrations/meta/_journal.json`) : **2** entrées seulement
   (`0000_shocking_warhawk`, `0001_sloppy_vengeance`) — seules les deux premières migrations ont été
   générées par `drizzle-kit generate` ; tout le reste est du SQL écrit à la main, jamais journalisé.
3. **L'historique remote** (`supabase_migrations.schema_migrations` en prod) : **47** entrées.
   Rapprochement précis avec les fichiers locaux :
   - **45 fichiers locaux retrouvés**, dont **6 sous un nom divergent** (`0005`–`0008` appliqués sans
     préfixe numérique : `calendar_echeance_relance`, etc. ; `0018` → `crm_vues_fonctions_a10` ;
     `0019` → `crm_caisses_avs_numeros_a9`) ;
   - **12 fichiers locaux sans aucune trace** dans l'historique : `0000_shocking_warhawk`,
     `0001_sloppy_vengeance`, `0002`–`0004`, `0021`–`0024`, `0050`–`0052` ;
   - **2 entrées remote sans fichier local** : `0000_crm_schema_cabinet` (variante renommée du 0000
     initial) et `0046b_demande_suppression_client_restrict` (hotfix appliqué en prod, jamais
     reversé dans le repo → deuxième collision de numérotation).

Point crucial : **absence de l'historique ≠ non appliqué**. Plusieurs migrations absentes de
l'historique sont manifestement **effectives en prod** (ex. `0002_onboarding_rls` /
`0003_grants_authenticated` — l'onboarding fonctionne ; `0052_extraction_ia_active_default_true` —
défaut opt-out constaté, cf. amendement ADR 0023). Elles ont été appliquées via `execute_sql` ou à
la main, sans journalisation.

**Comment on en est arrivé là** : les migrations sont écrites à la main dans
`packages/db/migrations/` puis appliquées **manuellement** à la base partagée, session par session,
via le MCP Supabase (`apply_migration`, qui journalise, ou `execute_sql`, qui ne journalise pas).
**Aucune application automatique** n'existe : ni en CI (« CI n'applique pas les migrations » —
risque connu de `PLAN-MVP-BETA.md`), ni au deploy (le pipeline `migration-prod` avec approbation
manuelle décrit dans `dev-environment.md` § 8.1 n'a jamais été implémenté).

**Conséquences concrètes :**

- La base n'est **pas reconstructible depuis le repo** : rejouer les 57 fichiers dans l'ordre sur
  une base vierge n'est ni garanti ni testé (ordre ambigu sur les collisions, hotfix `0046b`
  manquant). Donc **pas de staging possible**, et pas de **base de test dédiée** iso-prod — ce qui
  bloque la séparation tests/prod (P0-2 de l'audit : la suite d'intégration frappe la prod).
- `pnpm db:migrate` (`drizzle-kit migrate`) est **dangereux** : son journal ne connaît que 2
  migrations, il tenterait de rejouer un historique faux.
- Chaque application manuelle est une occasion de drift supplémentaire (oubli de commit, oubli de
  journalisation, renommage à l'apply).

## Décision (cible proposée)

1. **Source unique = les fichiers SQL versionnés de `packages/db/migrations/`.** C'est déjà la
   convention de fait (SQL écrit à la main, RLS/triggers/fonctions inclus — ce que le schéma
   Drizzle, filtré sur `crm` et sans triggers, ne couvre pas). Le journal Drizzle
   (`meta/_journal.json`) cesse d'être une vérité : `drizzle-kit` reste un outil de **génération**
   ponctuelle de SQL le cas échéant, jamais d'application. Les scripts `db:migrate` / `db:push` de
   `packages/db/package.json` seront retirés ou neutralisés (follow-up).
2. **Application exclusivement via la Supabase CLI** (`supabase migration up` / `supabase db push`),
   automatisée :
   - **en CI** : la base de **test dédiée** est migrée avant la suite d'intégration (les tests
     valident ainsi les migrations elles-mêmes — comble le risque « CI n'applique pas les
     migrations ») ;
   - **au deploy prod** : step d'application avec **approbation manuelle**, comme prévu dès
     l'origine par `dev-environment.md` § 8.1.
   - **Plus aucune application manuelle** (MCP `apply_migration` / `execute_sql`, SQL editor) hors
     procédure d'incident documentée avec journalisation a posteriori obligatoire.
   - Contrainte d'outillage : la CLI lit `supabase/migrations/*.sql` (préfixe horodaté). Le
     follow-up tranche le mécanisme d'exposition (déplacement du dossier + pointeur dans
     `packages/db/`, ou lien) — le principe fixé ici est **une seule source, un seul applicateur**.
3. **Rebaseline** (l'historique actuel n'est pas réparable entrée par entrée à coût raisonnable) :
   - dump du **schéma réel de prod** (structure uniquement, zéro donnée hors catalogues seedés) →
     migration **`0000_baseline`**, nouveau point zéro prouvé reconstructible ;
   - les 57 fichiers historiques sont **archivés** (ex. `packages/db/migrations/_archive/`, lecture
     seule, traçabilité) — ils ne sont plus jamais rejoués ;
   - l'historique remote est **réparé** (`supabase migration repair`) pour ne refléter que la
     baseline ; toute migration ultérieure reprend une **numérotation stricte** (format horodaté de
     la CLI), appliquée uniquement par le pipeline.

## Plan d'exécution (follow-up — rien de tout ceci dans la PR qui introduit cette ADR)

1. **Pré-requis (P0-2)** : créer le projet Supabase de **test dédié** ; poser les secrets GitHub
   Actions `TEST_DATABASE_URL`, `TEST_NEXT_PUBLIC_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`
   (la CI d'isolation est déjà **fail-closed** sur leur absence).
2. **État des lieux figé** : lancer `scripts/migrations-drift.ts` (lecture seule) et
   `supabase db diff` contre prod ; confirmer que les 12 fichiers « sans trace » sont bien effectifs
   dans le schéma ; récupérer le SQL du hotfix `0046b` depuis `supabase_migrations.statements` et le
   reverser dans l'archive.
3. **Gel des migrations** : aucune nouvelle migration pendant l'opération (fenêtre courte, à
   annoncer).
4. **Baseline** : `supabase db dump` (schéma + catalogues seedés uniquement) → `0000_baseline` ;
   archivage des 57 fichiers ; mise en place du layout CLI.
5. **Preuve de reconstructibilité** : reconstruire la base de test **depuis la seule baseline** ;
   suite d'intégration verte dessus. C'est le critère d'acceptation du rebaseline.
6. **Réparation de l'historique prod** : `supabase migration repair` (métadonnées uniquement — ne
   touche pas au schéma ni aux données).
7. **Câblage pipeline** : step CI « migrate la base de test » avant `test-integration` ; step deploy
   prod avec approbation manuelle ; protection de branche `main` avec le check requis.
8. **Documentation** : mettre à jour `dev-environment.md` § 5/§ 8, `packages/db/CLAUDE.md`
   (« Process de migration ») et le `CLAUDE.md` racine (référence ADR) — modifications des
   `CLAUDE.md` soumises à validation explicite du founder.

## Risques (assumés / mitigés)

- **Le dump baseline fige aussi le drift non documenté** (objets créés hors migrations). Assumé :
  c'est précisément le but — la baseline reflète la **réalité**, pas l'intention. Mitigation :
  `supabase db diff` + relecture du dump avant validation.
- **Périmètre du dump** : extensions, `pg_cron` jobs, grants, policies Storage, config Vault ne sont
  pas tous capturés par un dump schéma standard → checklist dédiée au follow-up (étape 4).
- **`migration repair` sur prod** : opération en métadonnées uniquement, mais à exécuter avec la
  base de test comme répétition générale ; l'historique actuel est exporté avant (rollback = ré-insertion).
- **Perte de granularité historique** : l'archive `_archive/` + l'export de
  `supabase_migrations` conservent la traçabilité (exigence d'audit, 6 ans).
- **Migration en vol pendant le gel** : fenêtre courte + annonce ; le drift script permet de
  vérifier l'état juste avant bascule.

## Alternatives écartées

- **`drizzle-kit migrate` comme applicateur** : son journal est faux (2/57) et son modèle (schéma
  TypeScript filtré sur `crm`) ne couvre ni les triggers, ni les RLS, ni les fonctions, ni les vues
  écrites en SQL manuel — reconstruire le journal = même effort de réconciliation, sans gagner
  l'application au deploy.
- **Réparer l'historique entrée par entrée sans rebaseline** : 12 entrées manquantes + 2 orphelines
  + 6 renommages + 2 collisions à réconcilier une à une, sans jamais prouver la reconstructibilité ;
  coût supérieur, résultat plus fragile qu'un point zéro dumpé depuis la réalité.
- **Statu quo (application manuelle via MCP)** : c'est la cause racine du drift ; incompatible avec
  une staging et avec la séparation base de test / prod exigée par l'audit (P0-2).

## Conséquences

### Positives
- Base **reconstructible** depuis le repo → staging possible, base de test dédiée iso-prod, CI qui
  valide les migrations elles-mêmes.
- **Une** vérité (fichiers du repo), **un** applicateur (CLI en pipeline) : le drift ne peut plus
  se reproduire silencieusement.
- Le pipeline `migration-prod` prévu par `dev-environment.md` § 8.1 devient réel.

### Négatives (assumées)
- L'historique fin des 57 migrations n'est plus « rejouable », seulement archivé.
- Discipline nouvelle : plus d'apply manuel en session, même pour un hotfix (procédure d'incident
  obligatoire).
- Fenêtre de gel des migrations pendant le rebaseline.

## Conditions de révision
- Si Supabase fait évoluer le format/l'emplacement de `supabase_migrations` ou de la CLI →
  ré-évaluer le mécanisme d'application (le principe « une source, un applicateur » demeure).
- Si un self-host Postgres remplace Supabase Cloud (ADR 0004) → remplacer la CLI par un applicateur
  équivalent (ex. runner SQL maison idempotent), à ADR dédiée.

## Références
- `AUDIT-MVP.md` § 4 (registre des risques) et § 8 (P0-3) — constat d'origine.
- `scripts/migrations-drift.ts` — diagnostic lecture seule du drift (livré avec cette ADR).
- `.github/workflows/ci.yml` — job `test-integration` fail-closed sur `TEST_*` (livré avec cette ADR).
- `docs/architecture/dev-environment.md` § 5 (migrations) et § 8.1 (pipeline `migration-prod`).
- `packages/db/CLAUDE.md` § Process de migration (à mettre à jour au follow-up).
- ADR 0004 (Supabase Cloud), ADR 0005 + addendum (base partagée, RLS bypassée par le chemin app).
- `PLAN-MVP-BETA.md` — risque connu « CI n'applique pas les migrations ».
