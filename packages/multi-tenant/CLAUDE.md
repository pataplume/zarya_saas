# Instructions Claude Code — packages/multi-tenant

## Contexte
Helpers pour la résolution du tenant (cabinet) et l'isolation multi-tenant. Cœur de l'architecture ZARYA.

## Rôle critique
Ce package est **le filet de sécurité** contre les fuites cross-tenant. Chaque feature qui touche aux données passe par lui. Un bug ici = catastrophe potentielle.

## Structure
```
packages/multi-tenant/
├── db-client.ts            # getDbForCabinet(cabinet_id)
├── context.ts              # AsyncLocalStorage pour cabinet_id implicite
├── helpers.ts              # requireCabinetId, getCurrentCabinetId
├── rls.ts                  # SQL helpers pour current_cabinet_id()
└── types.ts
```

## Règles non-négociables

### 1. Une seule façon de query la DB
```typescript
// ✅ CORRECT
const db = getDbForCabinet(cabinet_id);
const clients = await db.select().from(client);

// ❌ INTERDIT
const db = new DrizzleClient(); // pas de scope tenant
const clients = await db.select().from(client);
```

### 2. cabinet_id obligatoire
- Pas de fonction de query sans `cabinet_id`
- Si tu ne connais pas le `cabinet_id`, c'est qu'il y a un bug en amont (auth manquante ?)

### 3. Vérification de cohérence
- Si une opération touche plusieurs ressources, vérifier que toutes appartiennent au même cabinet
- Helper `assertSameCabinet(ressource1, ressource2)` à utiliser

### 4. Pas de bypass admin
- Pas de `getAdminDb()` qui ignore le multi-tenant
- Le rôle "service" ZARYA support a accès via une procédure dédiée et auditée, pas via le package

### 5. AsyncLocalStorage pour context implicite (optionnel)
```typescript
// Dans middleware Next.js
await cabinetContext.run({ cabinet_id, user_id }, async () => {
  // Tout le code dans cette session connaît le cabinet_id
  // Pas besoin de le passer en param partout
});
```

## API publique

### `getDbForCabinet(cabinet_id: string)`
Retourne un client DB scopé.
- Set `current_cabinet_id` PostgreSQL pour cette connexion
- RLS appliquée automatiquement
- Vérifie que le cabinet existe et n'est pas suspendu

### `requireCabinetId()` 
Récupère le cabinet_id du context (AsyncLocalStorage ou JWT).
Throw si absent.

### `getCurrentCabinetId()`
Comme require mais retourne `null` si absent.

### `assertSameCabinet(...resources)`
Vérifie que toutes les ressources passées ont le même `cabinet_id`.
Throw `MultiTenantViolation` sinon.

## Côté SQL

### Fonction `current_cabinet_id()` à créer dans la première migration
```sql
CREATE OR REPLACE FUNCTION current_cabinet_id() RETURNS uuid AS $$
  SELECT current_setting('app.current_cabinet_id', true)::uuid;
$$ LANGUAGE sql STABLE;
```

### Set du contexte à chaque connexion
```typescript
// Dans getDbForCabinet
await db.execute(sql`SET LOCAL app.current_cabinet_id = ${cabinet_id}`);
```

## Tests obligatoires (BLOQUANTS en CI)

```typescript
describe('Multi-tenant package - critical security', () => {
  test('getDbForCabinet returns scoped client', async () => {...});
  test('queries return only cabinet data', async () => {...});
  test('insert with wrong cabinet_id is rejected', async () => {...});
  test('assertSameCabinet throws on mismatch', async () => {...});
  test('requireCabinetId throws when context missing', async () => {...});
  test('cabinet suspended cannot query', async () => {...});
  // 8+ tests minimum
});
```

Ces tests **bloquent le merge**. Aucune exception.

## Patterns d'usage

### Server Action
```typescript
'use server';
import { requireCabinetId, getDbForCabinet } from '@zarya/multi-tenant';

export async function listClients() {
  const cabinet_id = await requireCabinetId();
  const db = getDbForCabinet(cabinet_id);
  return db.select().from(client);
}
```

### Route Handler (webhook)
```typescript
import { getDbForCabinet } from '@zarya/multi-tenant';

export async function POST(request: Request) {
  const payload = await request.json();
  
  // Identification du cabinet via clientState ou metadata
  const cabinet_id = await identifyCabinetFromWebhook(payload);
  if (!cabinet_id) return new Response('Unauthorized', { status: 401 });
  
  const db = getDbForCabinet(cabinet_id);
  // ...
}
```

### Job background
```typescript
async function processCabinetJob(cabinet_id: string) {
  const db = getDbForCabinet(cabinet_id);
  // Tout le job est scopé au cabinet
}
```

## Ce que tu NE fais PAS

- Pas de `db.execute(sql\`...\`)` sans scope tenant
- Pas de query avec `WHERE cabinet_id = ...` manuel (utiliser RLS)
- Pas de désactivation temporaire des RLS policies
- Pas de fonction "internal" qui bypass le multi-tenant
- Pas de cache global indexé sans `cabinet_id` dans la clé

## Référence documentation

- `/docs/architecture/multi-tenant.md` — spec complète
- ADR 0005 — décision multi-tenant natif
- `/docs/architecture/security-and-audit.md` § 6 — isolation
