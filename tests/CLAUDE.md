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
