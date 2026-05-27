# Instructions Claude Code — packages/auth

## Contexte
Helpers d'authentification et d'autorisation. Wrappers autour de Supabase Auth + logique RBAC ZARYA.

## Structure
```
packages/auth/
├── client.ts               # Supabase Auth client
├── server.ts               # Server-side helpers
├── rbac.ts                 # Role-based access control
├── session.ts              # Helpers de session
├── policies.ts             # Permission policies
└── types.ts
```

## Rôles RBAC

### Côté cabinet (4 rôles)
- **responsable** : tous droits sur le tenant cabinet
- **gestionnaire_salaires** : accès complet aux modules Salaire + lecture autre
- **collaborateur** : accès opérationnel (Doc, CRM, Facture, Calendar) sans accès salaires détaillés
- **lecteur** : lecture seule

### Côté client final (1 rôle)
- **client_contact** : accès dashboard client uniquement, scopé sur son `client_id`

### Stockage des rôles
- Dans `auth.users.app_metadata.role`
- Injecté dans le JWT
- Lisible côté serveur et client

## Règles non-négociables

### 1. Vérification systématique
- Toute Server Action vérifie auth + role
- Toute Route Handler vérifie auth + role
- Pas d'endpoint "public" qui retourne des données métier

### 2. Helpers obligatoires
```typescript
// ❌ Mauvais
const user = await supabase.auth.getUser();
if (!user) throw new Error('Auth required');

// ✅ Bon
const user = await requireAuth();
const cabinetMember = await requireCabinetMember();
const responsable = await requireRole('responsable');
```

### 3. Privilege escalation interdite
- Aucun utilisateur ne peut s'auto-promouvoir
- Changement de rôle nécessite validation par un autre responsable
- Audit log sur tous les changements de rôle

### 4. Sessions
- Cookies httpOnly, secure, SameSite=Strict
- TTL 24h par défaut
- Refresh token avec rotation
- Logout révoque tous les refresh tokens

### 5. 2FA
- Optionnelle au MVP, recommandée
- Obligatoire Phase 2 pour rôles sensibles (responsable, gestionnaire_salaires)
- TOTP standard

## API publique

### `getCurrentUser()`
Retourne l'utilisateur authentifié OU `null`.
Pas d'erreur, juste null.

### `requireAuth()`
Retourne l'utilisateur OU throw `UnauthorizedError`.

### `requireCabinetMember()`
Retourne `{ user, cabinet_id, role }` ou throw.

### `requireRole(role: Role | Role[])`
Vérifie que l'utilisateur a un des rôles passés.

### `requireClientContact()`
Pour les routes du dashboard client uniquement.

### `can(user, action, resource)`
Vérification fine de permission.
Exemple : `can(user, 'update', 'client', { client_id })`.

## Patterns d'usage

### Server Action protégée
```typescript
'use server';
import { requireRole } from '@zarya/auth';

export async function deleteClient(client_id: string) {
  const { cabinet_id } = await requireRole(['responsable']);
  const db = getDbForCabinet(cabinet_id);
  return db.update(client).set({ archived_at: new Date() }).where(eq(client.id, client_id));
}
```

### Middleware Next.js
```typescript
// middleware.ts
import { authMiddleware } from '@zarya/auth';

export const middleware = authMiddleware({
  publicPaths: ['/', '/pricing', '/login', '/signup'],
  loginPath: '/login',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Page server-side
```typescript
import { requireCabinetMember } from '@zarya/auth';

export default async function ClientsPage() {
  const { cabinet_id } = await requireCabinetMember();
  // ...
}
```

## Politique de mot de passe
- Longueur min : 12 caractères
- Vérification haveibeenpwned (Phase 2)
- Pas d'expiration forcée
- Rate limiting : 5 essais / 15 min / IP

## Détection d'anomalies
- Nouvelle IP / géo → notification email
- Multiple échecs → blocage temporaire
- Heures inhabituelles → alerte (configurable)

## Tests obligatoires

```typescript
describe('Auth & RBAC', () => {
  test('unauthorized user cannot access app routes');
  test('client_contact cannot access fiduciaire routes');
  test('collaborateur cannot delete clients');
  test('JWT contains correct cabinet_id');
  test('expired session redirects to login');
  test('logout revokes refresh tokens');
});
```

## Ce que tu NE fais PAS

- Pas de vérif auth uniquement côté client (toujours côté serveur en plus)
- Pas de password en clair dans les logs / erreurs
- Pas de session non révocable
- Pas de "remember me" qui prolonge indéfiniment
- Pas d'admin god mode (même le support ZARYA est tracé)

## Référence documentation

- `/docs/architecture/security-and-audit.md` § 4-5
- ADR 0005 — multi-tenant (lien avec RBAC)
