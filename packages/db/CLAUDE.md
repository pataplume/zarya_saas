# Instructions Claude Code — packages/db

## Contexte
Schémas Postgres, migrations Drizzle, seeds. Source de vérité pour le modèle de données ZARYA.

## Stack
- Postgres 16+ via Supabase Cloud — région **eu-central-2 (Zurich, Suisse)**, données au repos en CH (ADR 0001 amendée)
- Drizzle ORM + Drizzle Kit
- Extensions : pgvector, pg_cron, pgcrypto, pg_trgm, uuid-ossp

## Structure
```
packages/db/
├── src/
│   ├── schema/
│   │   ├── crm.ts          # crm.cabinet, crm.client, crm.contact, etc.
│   │   ├── doc.ts          # doc.email_brut, doc.document, etc.
│   │   ├── facture.ts      # facture.fournisseur, facture.facture, etc.
│   │   ├── salaire.ts      # salaire.employe, salaire.periode, etc.
│   │   ├── calendar.ts     # calendar.template_echeance, etc.
│   │   ├── extraction.ts   # extraction.invocation
│   │   ├── audit.ts        # audit.*
│   │   ├── search.ts       # search.document_chunk, search.requete
│   │   └── index.ts
│   ├── client.ts           # Client DB (postgres-js + Drizzle)
│   ├── audit.ts · vault.ts # Helpers audit append-only + Supabase Vault
│   └── index.ts            # Export du client DB
└── migrations/             # SQL généré par Drizzle Kit + triggers/fonctions
```

## Règles non-négociables

### 1. Multi-tenant
- TOUTE table métier porte `cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT`
- Exceptions : `crm.cabinet` elle-même, catalogues globaux (`crm.standard_*`)
- Tables avec `client_id` : trigger vérifie cohérence `cabinet_id = client.cabinet_id`

### 2. Conventions schéma
- `snake_case` pour toutes les colonnes et tables
- PK : `uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- Timestamps : `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
- Soft delete : `archived_at timestamptz NULL` (RLS doit inclure `archived_at IS NULL` par défaut)
- Pas de DELETE physique sauf process RGPD dédié

### 3. RLS systématique
- Activer RLS : `ALTER TABLE schema.table ENABLE ROW LEVEL SECURITY`
- 4 policies génériques par table métier :
  - `tenant_isolation_select`
  - `tenant_isolation_insert`
  - `tenant_isolation_update`
  - `tenant_isolation_delete`
- Fonction `current_cabinet_id()` comme source de vérité
- Référence : `/docs/architecture/multi-tenant.md` § 5

### 4. Migrations
- **Forward-only** : pas de downgrade automatique en prod
- Numérotation séquentielle + horodatage
- Inclure RLS dans la même migration que la création de table
- Tester sur Supabase local avant commit
- Réversibles manuellement si besoin (DROP, ALTER reverse)
- Pas de DROP COLUMN en prod sans process dédié

### 5. Triggers et fonctions
- Stockés dans `migrations/`, pas générés depuis Drizzle
- Nommage explicite : `fn_check_cabinet_consistency()`, `trg_audit_facture_change`
- Toujours testés en intégration

## Conventions Drizzle

### Définition table
```typescript
export const client = pgTable('client', {
  id: uuid('id').primaryKey().defaultRandom(),
  cabinet_id: uuid('cabinet_id').notNull().references(() => cabinet.id),
  raison_sociale: text('raison_sociale').notNull(),
  ide: text('ide'),
  // ...
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archived_at: timestamp('archived_at', { withTimezone: true }),
}, (table) => ({
  cabinetIdx: index('idx_client_cabinet').on(table.cabinet_id, table.archived_at),
  ideUnique: unique('uniq_client_ide_per_cabinet').on(table.cabinet_id, table.ide),
}));
```

### Index obligatoires
- Toujours indexer `cabinet_id` (composite avec un autre filtre fréquent)
- Index partiels pour les filtres récurrents (`WHERE archived_at IS NULL`)
- GIN pour la recherche full-text (`to_tsvector`)
- HNSW pour pgvector

### Enums
- Définir comme types Postgres natifs (pas comme strings)
- Stockés dans le schéma applicatif (`crm.statut_client`)

## Process de migration

```bash
# 1. Modifier le schéma
vim packages/db/schema/crm.ts

# 2. Générer
pnpm db:generate

# 3. Reviewer le SQL
cat packages/db/migrations/XXXX_*.sql

# 4. Appliquer en local
pnpm db:migrate

# 5. Tester
pnpm test

# 6. Commit
```

## Seeds

### Où vivent les données de seed
- **Catalogues / référentiels standards** (échéances fédérales, formats d'export, templates
  ZARYA `cabinet_id NULL`) : posés via **migrations** dédiées (ex.
  `migrations/0008_calendar_seed_echeances_federales.sql`, `migrations/0040_seed_format_export.sql`).
- **Données fictives pour les tests d'intégration** : générées en code via
  `tests/integration/helpers/seed.ts` (+ `auth.ts` pour les users Supabase réels).
- Pas de dossier `packages/db/seed/` ni de runner de seed applicatif séparé.

### Règles seeds
- Données réalistes (pas "Test1", "Test2")
- Couvrir les cas limites (cabinet vide, cabinet plein, client archivé, etc.)
- Reproductible (idempotent)
- Pas de seed en production

## Tests obligatoires

### Tests d'isolation multi-tenant (BLOQUANTS)
```typescript
describe('Multi-tenant isolation - DB level', () => {
  test('cabinet A cannot SELECT cabinet B data', async () => {...});
  test('cabinet A cannot INSERT with cabinet B id', async () => {...});
  test('cabinet A cannot UPDATE cabinet B data', async () => {...});
  test('cabinet A cannot DELETE cabinet B data', async () => {...});
  test('every metier table has RLS enabled', async () => {...});
  test('current_cabinet_id() returns correct value per context', async () => {...});
});
```

### Tests de schéma
- Contraintes CHECK respectées
- Triggers fonctionnent
- Foreign keys protègent l'intégrité

## Ce que tu NE fais PAS

- Pas de DROP TABLE en migration sans confirmation
- Pas de table sans `cabinet_id` (sauf exceptions documentées)
- Pas de RLS désactivée temporairement (jamais)
- Pas de SELECT * en code applicatif (projection explicite)
- Pas de raw SQL sans paramètres (jamais d'injection possible)
- Pas de modification du schéma `auth.*` (géré par Supabase)
- Pas de seed depuis le code applicatif (uniquement scripts dédiés)

## Pièges connus

### "TypeError: Invalid URL" au build Vercel — `DATABASE_URL` malformée

`postgres-js` appelle `new URL()` au **chargement du module**, pas à l'exécution des queries.
Une `DATABASE_URL` malformée crashe donc le build Next.js à l'étape "Collecting page data",
avec un stack trace opaque pointant vers `.next/server/chunks/`.

**Format correct :**
```
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

**Erreurs fréquentes :**
- `@db.` manquant → `postgresql://postgres:PASSWORDdb.PROJECT_REF...` (password collé au hostname)
- `@` manquant → le driver interprète tout comme le hostname
- Espaces ou caractères spéciaux non-encodés dans le mot de passe

**Diagnostic rapide :** si le build Vercel échoue sur "Collecting page data" avec `ERR_INVALID_URL`,
vérifier `DATABASE_URL` en premier dans Vercel → Settings → Environment Variables.

**Fix dans le code :** `packages/db/src/client.ts` lève maintenant une `Error` explicite
si `DATABASE_URL` est absente, avec le format attendu dans le message (Sprint 2b.1).

---

### Création de users Supabase en SQL brut — pièges auth.*

Ne jamais insérer directement dans `auth.users`. GoTrue requiert :
1. Les champs `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` à `''` (chaîne vide, **pas NULL**) — `pgx` ne sait pas convertir NULL en `string`.
2. Une ligne dans `auth.identities` pour chaque provider (sinon le user ne peut pas se connecter).

**Utiliser à la place :** `supabase.auth.admin.createUser()` via le service role (`createSupabaseAdminClient`), qui gère ces détails automatiquement.

---

## Référence documentation produit

- `/docs/architecture/multi-tenant.md` — RLS, cabinet_id, isolation
- `/docs/data-model/entity-relationships.md` — ERD global
- `/docs/data-model/*-schema.md` — Schémas détaillés par domaine
- ADR 0005 (multi-tenant), ADR 0004 (Supabase)
