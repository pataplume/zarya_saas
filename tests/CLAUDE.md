# Instructions Claude Code — tests/

## Contexte
Tests intégration et E2E qui complètent les tests unitaires des packages. Le filet de sécurité de ZARYA.

## Structure
```
tests/
├── integration/
│   ├── multi-tenant-isolation/    # CRITIQUE - bloquant CI
│   ├── extraction/                # Tests avec Bedrock sandbox
│   ├── microsoft-graph/           # Tests avec tenant test
│   └── ...
├── e2e/                           # Playwright
│   ├── onboarding-fiduciaire.spec.ts
│   ├── onboarding-client.spec.ts
│   ├── validation-salaire.spec.ts
│   └── ...
└── fixtures/                      # Données de test partagées
```

## Stack
- **Unit** : Vitest (dans chaque package)
- **Integration** : Vitest + Supabase test client
- **E2E** : Playwright
- **Visual regression** (optionnel) : Chromatic ou Playwright snapshots

## Coverage cible

| Catégorie | Coverage |
|---|---|
| Code métier critique (extraction, validation, exports) | 70% |
| Sécurité (auth, RLS, multi-tenant) | 90% |
| Pipeline IA | 80% |
| UI composants | 50% |
| E2E parcours critiques | 100% des flows P0 |

## Tests critiques OBLIGATOIRES en CI

### 1. Multi-tenant isolation (bloquants)
```typescript
describe('Cross-tenant isolation', () => {
  test('Cabinet A cannot SELECT Cabinet B clients');
  test('Cabinet A cannot INSERT with Cabinet B id (rejected by RLS)');
  test('Cabinet A cannot UPDATE Cabinet B data');
  test('Cabinet A cannot DELETE Cabinet B data');
  test('Client contact A cannot see Client contact B data');
  test('Service role bypasses RLS only in audited contexts');
  test('Every table in metier schemas has RLS enabled');
  test('All FK with cabinet_id have trigger consistency check');
});
```

### 1bis. Anti-fuite cross-tenant — CHEMIN APPLICATIF (bloquant CI)

Fichier : `tests/integration/cross-tenant-leak/generic-leak.test.ts`.

Pourquoi ce test existe en plus de `multi-tenant-isolation/` : le `db` exporté par
`@zarya/db` se connecte en **service role et contourne la RLS** sur le chemin app
(cf. ADR 0005 addendum 28 mai 2026). Les tests `multi-tenant-isolation/` valident la
RLS Postgres directement (chemin DB), mais **pas** le chemin applicatif réel. Ce test
couvre cette lacune : il rejoue le contrat de sécurité réel (filtre `cabinet_id`
discipliné) via le vrai `db`.

Pour CHAQUE table métier, via un registre central `METIER_TABLES` :
- SELECT scopé cabinet A ne retourne jamais une ligne de cabinet B ;
- UPDATE scopé A ciblant une ligne de B n'affecte 0 ligne ;
- DELETE scopé A ciblant une ligne de B n'affecte 0 ligne.

Plus : un test « d'honnêteté du modèle » (SELECT sans filtre voit les 2 cabinets =
preuve que la RLS est contournée sur le chemin app) et un test structurel (RLS reste
activée en DB, défense en profondeur — `crm.cabinet` exclu, c'est la racine du tenant).

**RÈGLE NON NÉGOCIABLE** : toute nouvelle table métier DOIT être ajoutée à
`METIER_TABLES` (+ `RLS_TABLES` si RLS activée). Cf. ADR 0005 addendum.

### 1ter. Sceau anti-clair — colonnes ultra-sensibles (bloquant CI)

Fichiers : `tests/integration/anti-plaintext/sensitive-columns.ts` (registre) +
`sensitive-columns.test.ts` (test). Source de vérité du chiffrement au repos (ADR 0013 +
addendum Phase I). Le test scanne `information_schema` et **échoue** si une colonne au nom
sensible (`%iban%`, `%avs%`, `%token%`, `%credential%`, `%secret%`, `%open_banking%`,
`%acces_logiciel%`) n'est ni dans `SENSITIVE_COLUMNS` ni dans `NON_SENSITIVE_ALLOWLIST`.

**RÈGLE NON NÉGOCIABLE** : toute nouvelle colonne ultra-sensible DOIT être inscrite dans
`SENSITIVE_COLUMNS` avec son mécanisme (`vault` = chiffré via indirection `*_vault_id` ;
`clair_differe` = sans write-path, ADR 0013 ; `clair_accepte` = non-secret justifié). Un
1er write-path vers une colonne `clair_differe` doit la basculer en `vault` + test anti-clair
**avant merge** (ADR 0013 condition de révision).

### 2. Auth et autorisation
```typescript
describe('Auth & RBAC', () => {
  test('Unauthenticated cannot access protected routes');
  test('Collaborateur cannot delete client');
  test('Client_contact cannot access fiduciaire routes');
  test('Expired session redirects to login');
});
```

### 3. Pipeline extraction IA
```typescript
describe('Extraction pipeline', () => {
  test('Facture extraction produces valid proposition');
  test('Anomalies detected and flagged');
  test('IBAN change triggers fraud alert');
  test('Validation creates final entity with audit log');
  test('Failed extraction does not corrupt state');
});
```

## E2E parcours critiques

Flows à couvrir en Playwright :
- **Flow F** : onboarding fiduciaire complet
- **Flow G** : onboarding client + référentiel employés
- **Flow A** : email entrant → classification → validation
- **Flow B** : facture détectée → extraction → export
- **Flow C** : échéance → relance → réponse
- **Flow E** : cycle mensuel salaire (client + cabinet)

Pour chaque flow :
- Happy path
- 1-2 cas d'erreur critiques

## Données de test

### Fixtures partagées
```
fixtures/
├── cabinets/               # 3-5 cabinets fictifs variés
├── clients/                # 10-50 clients par cabinet
├── employes/               # Référentiel salaire
├── documents/              # PDFs, Excel, emails de test
└── factures/               # Factures Swissdec, QR-factures, etc.
```

### Anonymisation
- Pas de vraies données client dans les fixtures
- Données réalistes générées (Faker)
- Couvrir les cas limites (cabinet vide, client archivé, etc.)

## Patterns

### Setup test multi-tenant
```typescript
async function setupTwoCabinets() {
  const cabinetA = await createCabinet({ name: 'Test A' });
  const cabinetB = await createCabinet({ name: 'Test B' });
  
  const clientA = await createClient({ cabinet_id: cabinetA.id });
  const clientB = await createClient({ cabinet_id: cabinetB.id });
  
  return { cabinetA, cabinetB, clientA, clientB };
}
```

### Cleanup après chaque test
- Truncate des tables métier
- Reset des sequences
- Suppression des fichiers Storage uploadés

### Tests d'intégration avec services externes
- Sandbox dédié pour chaque provider
- Tests CI tagués `@external` pour pouvoir les skip si coût élevé
- Tests manuels avant chaque release

### Server actions authentifiées (Phase 3.6)

On teste la VRAIE server action (`apps/web/.../actions.ts`) contre la base de test,
mais une server action ne peut pas tourner nativement sous Vitest : `requireAuth()`
lit les cookies via `next/headers`, et `revalidatePath()` exige un scope de requête
Next. On neutralise ces deux dépendances et on garde tout le reste réel (db service
role, triggers DB, Zod).

**Trois pièces, toutes nécessaires :**

1. **Utilisateur Supabase réel** — `createTestUser(sql, { cabinet_id, role })`
   (`tests/integration/helpers/auth.ts`) crée un vrai user via l'API admin
   (`@zarya/auth/admin`) + son `crm.cabinet_membre`, et expose `user.authUser`
   (`{ id, app_metadata: { cabinet_id, role } }`). Ne JAMAIS créer un user en SQL brut
   (HANDOFF_V2.md § 2.7). Toujours `cleanupTestUsers(sql, ...users)` ensuite.

2. **Mock de `@zarya/auth`** — un état hoisté injecte l'utilisateur courant :
   ```typescript
   const authState = vi.hoisted(() => ({ user: null as null | { id: string; app_metadata: Record<string, unknown> } }));
   vi.mock("@zarya/auth", () => ({
     requireAuth: async () => { if (!authState.user) throw new Error("UnauthorizedError"); return authState.user; },
   }));
   // ... afterEach(() => { authState.user = null; });
   // ... authState.user = user.authUser; avant chaque appel d'action.
   ```

3. **Résolution de modules cohérente (CRITIQUE)** — sous pnpm, `@zarya/*` et
   `next/cache` ne résolvent pas au même id depuis la racine (contexte du test) et
   depuis `apps/web` (contexte de l'action importée). Si les ids divergent, le
   `vi.mock` ne matche pas l'import de l'action. On force donc un id unique via des
   alias dans `vitest.config.ts` :
   - `@zarya/auth` → `packages/auth/src/index.ts` (le mock le remplace, `next/headers`
     n'est jamais évalué) ;
   - `@zarya/auth/admin` → `packages/auth/src/admin.ts`, **déclaré AVANT** `@zarya/auth`
     (Vite matche les alias string par préfixe) ;
   - `next/cache` → `tests/integration/helpers/next-cache-stub.ts` (no-op, pas de mock
     nécessaire).

L'action est importée dynamiquement APRÈS les `vi.mock` :
`const { action } = await import("../../../apps/web/.../actions");`.

Exemples : `server-actions/valider-proposition.test.ts`,
`server-actions/rejeter-proposition.test.ts`.

> Rappel : `tests/` n'est pas typechecké par `pnpm typecheck` (workspace packages
> uniquement) — la validation des types des tests se fait au runtime Vitest.

## Performance

### Tests rapides
- Tests unitaires : < 100ms en moyenne
- Tests intégration : < 5s en moyenne
- Tests E2E : < 60s par parcours

### Parallélisation
- Vitest en parallèle par défaut
- Playwright workers configurés selon CPU

## Ce que tu NE fais PAS

- Pas de tests qui dépendent de l'ordre d'exécution
- Pas de tests qui modifient des données partagées sans cleanup
- Pas de tests qui appellent la prod
- Pas de tests skippés sans ticket
- Pas de `expect(true).toBe(true)` ou tests vides
- Pas de tests qui dépendent de date/heure réelle (utiliser mock)

## Référence

- `/docs/architecture/dev-environment.md` § 7 — stratégie tests
- `/docs/architecture/multi-tenant.md` § 7 — tests isolation
- `/docs/flows/*.md` — parcours à couvrir en E2E
