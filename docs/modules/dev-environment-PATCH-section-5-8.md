# Patch — dev-environment.md § 5.8

> **Comment appliquer** : remplacer le bloc d'exemple Zod actuel par celui ci-dessous.
> Changement : la regex IDE accepte les deux formats (avec et sans séparateurs), conformément à ce qu'accepte Zefix.

---

### 5.8 Validation Zod
Tous les inputs externes (API, formulaires, webhooks) sont validés avec Zod **avant** d'être utilisés.

```typescript
// Format IDE : accepte CHE-123.456.789 et CHE123456789
// Normalisation côté serveur via @zarya/zefix avant appel API
const IdeSchema = z.string()
  .regex(/^CHE-?\d{3}\.?\d{3}\.?\d{3}$/, 'Format IDE invalide (attendu : CHE-XXX.XXX.XXX)')
  .transform(s => s.replace(/[.-]/g, ''))      // → CHE123456789
  .transform(s => `CHE-${s.slice(3, 6)}.${s.slice(6, 9)}.${s.slice(9, 12)}`); // → CHE-123.456.789 canonique

const CreateClientSchema = z.object({
  raison_sociale: z.string().min(1).max(200),
  ide: IdeSchema.optional(),
  langue: z.enum(['fr', 'de', 'it', 'en']),
});

// Dans le handler
const data = CreateClientSchema.parse(input);
```

**Note** : la version précédente utilisait `/^CHE-\d{3}\.\d{3}\.\d{3}$/` qui rejette les IDE sans séparateurs. Or Zefix les accepte (et les renvoie même sans séparateurs sur certains endpoints). On accepte les deux à la saisie, on stocke en format canonique avec séparateurs, on normalise sans séparateurs juste avant l'appel HTTP Zefix.

---

> **Patch additionnel pour la même page, § 3 (structure repo)** :
> Le sous-dossier `packages/integrations/zefix/` est désormais structuré. Voir [`zefix-integration.md`](./zefix-integration.md) § 5.1 pour la liste exacte des fichiers.
