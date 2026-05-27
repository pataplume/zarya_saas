# Instructions Claude Code — packages/ui

## Contexte
Composants UI partagés ZARYA. Customisation de shadcn/ui + composants métier réutilisables.

## Structure
```
packages/ui/
├── primitives/             # Composants shadcn/ui (button, input, dialog, etc.)
├── composites/             # Composants composés ZARYA (DataTable, EmptyState, etc.)
├── forms/                  # Composants formulaires (FieldWithValidation, etc.)
├── feedback/               # Toasts, alerts, banners
├── tokens.ts               # Design tokens (couleurs, espacements, etc.)
└── index.ts
```

## Stack
- shadcn/ui (base)
- Tailwind CSS v4
- Radix UI (primitives accessibles)
- Lucide React (icônes)

## Règles

### 1. Design tokens centralisés
- Couleurs : variables CSS dans `tokens.ts`
- Espacements : suivre l'échelle Tailwind (pas de valeurs arbitraires sauf cas justifié)
- Typo : 4-5 tailles max
- Pas de couleurs hex hardcodées dans les composants

### 2. Accessibilité (WCAG AA minimum)
- Contraste suffisant (vérifié)
- Navigation au clavier complète
- ARIA labels sur les actions sans texte
- Focus visible toujours

### 3. Mobile-first pour les composants client
- Composants destinés au dashboard client : design pour 375px minimum
- Composants destinés au dashboard fiduciaire : optimisés desktop

### 4. Pas de logique métier
- Les composants UI ne connaissent rien du domaine (cabinet, client, facture)
- Ils acceptent des props génériques
- Composition côté apps/web pour le métier

### 5. Stories Storybook
- Tout composant majeur a une story
- Variants visibles (default, disabled, error, loading, etc.)
- Stories alimentées par des données réalistes

## Patterns réutilisables

### Validation 1-clic (rappel UX principle 2)
```tsx
<ValidationCard
  proposal={proposal}
  onValidate={handleValidate}
  onCorrect={handleCorrect}
  onReject={handleReject}
  confidence={proposal.confidence}
/>
```

### Empty state avec action
```tsx
<EmptyState
  icon={<Inbox />}
  title="Aucun document à classer"
  description="Tous vos documents sont validés"
  action={{ label: "Importer", onClick: () => {...} }}
/>
```

### Save status indicator
```tsx
<SaveStatus status="saved" lastSavedAt={lastSave} />
// Pas de bouton Save global (UX principle 10)
```

### Source citation (Search, IA)
```tsx
<SourceCitation
  index={1}
  document={doc}
  highlight="text-snippet"
  onOpen={() => navigateToDoc(doc.id)}
/>
```

## Composants côté client final (mobile-first)

### Layout
- Bottom tab navigation (4-5 sections max)
- Floating action button pour action prioritaire
- Pull-to-refresh

### Branding cabinet
- Composants acceptent props `branding={{ logo, colors }}`
- Le contact RH voit "son cabinet", pas ZARYA

## Ce que tu NE fais PAS

- Pas de couleur hardcodée hors `tokens.ts`
- Pas de styles inline sauf cas extrêmes
- Pas de `dangerouslySetInnerHTML`
- Pas de composant > 200 lignes (refactoriser)
- Pas de logique métier dans les composants
- Pas de fetch direct depuis un composant UI

## Référence

- `/docs/ux-principles.md` — 10 principes UX non-négociables
- `/docs/dashboards.md` — architecture des 3 dashboards
- `/docs/modules/dashboard-client.md` — spec dashboard client
