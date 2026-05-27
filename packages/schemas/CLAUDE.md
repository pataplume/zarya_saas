# Instructions Claude Code — packages/schemas

## Contexte
Schémas Zod partagés entre frontend, backend, et tests. Source unique de vérité pour la validation des données.

## Structure
```
packages/schemas/
├── client.ts               # Schémas crm.client
├── contact.ts              # Schémas crm.contact
├── document.ts             # Schémas doc.*
├── facture.ts              # Schémas facture.*
├── salaire.ts              # Schémas salaire.*
├── extraction.ts           # Schémas extractions IA
├── common.ts               # Schémas communs (IBAN, AVS, IDE, etc.)
└── index.ts
```

## Règles

### 1. Une seule source de vérité
- Pas de duplication entre Drizzle types et Zod schemas
- Génération Zod depuis Drizzle si possible (`drizzle-zod`)
- Sinon : Zod manuel synchronisé manuellement

### 2. Schémas réutilisables
```typescript
// common.ts
export const ibanSchema = z.string()
  .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/)
  .refine(validateIbanChecksum, 'IBAN invalide');

export const avsSchema = z.string()
  .regex(/^756\.\d{4}\.\d{4}\.\d{2}$/)
  .refine(validateAvsChecksum, 'Numéro AVS invalide');

export const ideSchema = z.string()
  .regex(/^CHE-\d{3}\.\d{3}\.\d{3}$/);
```

### 3. Schémas par opération (pas par table)
```typescript
// client.ts
export const createClientSchema = z.object({
  raison_sociale: z.string().min(1).max(200),
  ide: ideSchema.optional(),
  langue: z.enum(['fr', 'de', 'it', 'en']),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
```

### 4. Validation côté frontend ET backend
- Frontend (React Hook Form) : feedback utilisateur instant
- Backend (Server Action / Route Handler) : sécurité
- Même schéma utilisé des deux côtés

### 5. Messages d'erreur i18n
```typescript
ibanSchema.refine(check, { 
  message: t('errors.iban.invalid') 
});
```

## Patterns

### Schémas conditionnels
```typescript
export const factureSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('standard'), montant: z.number().positive() }),
  z.object({ type: z.literal('avoir'), montant: z.number().negative() }),
]);
```

### Schémas avec transformation
```typescript
export const ibanInput = z.string()
  .transform(s => s.replace(/\s/g, '').toUpperCase());
```

### Schémas pour API externes
```typescript
// Validation des réponses Bedrock
export const factureExtractionSchema = z.object({
  fournisseur: z.string(),
  montant_ht: z.number(),
  // ...
  confiance_globale: z.number().min(0).max(1),
});
```

## Ce que tu NE fais PAS

- Pas de validation dans le code business (toujours via Zod)
- Pas de regex magiques sans schéma Zod
- Pas de any en sortie de schéma
- Pas de schéma défini ad hoc dans un fichier non-schemas

## Référence

- Modules `/docs/modules/*.md` — chaque module définit ses contraintes métier
- Schémas DB `/docs/data-model/*-schema.md` — alignement DB/Zod
