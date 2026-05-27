# Instructions Claude Code — apps/web

## Contexte
Application Next.js 15+ principale de ZARYA. Sert à la fois le dashboard fiduciaire (desktop-first) et le dashboard client (mobile-first).

## Structure
```
app/
├── (marketing)/        # Pages publiques (landing, pricing)
├── (app)/              # Dashboard fiduciaire + client (auth required)
├── api/                # Route handlers (webhooks, uploads)
├── auth/               # Auth flows (login, signup, magic links)
└── layout.tsx
```

## Règles spécifiques

### Server Components par défaut
- Préférer les Server Components à React Client Components
- `'use client'` uniquement quand nécessaire (interactivité, hooks, browser APIs)
- Pas de `useState` côté serveur

### Server Actions
- Mutations via Server Actions, pas via Route Handlers
- Validation Zod systématique des inputs
- Retour typé `{ success: boolean, data?, error? }`

### Route Handlers (`app/api/*`)
- Uniquement pour :
  - Webhooks entrants (Microsoft Graph, Stripe, Bedrock)
  - Uploads de fichiers
  - Endpoints consommés par des tiers
- Validation HMAC / signature pour les webhooks
- Toujours retourner statuts HTTP corrects

### Auth
- Middleware `middleware.ts` vérifie la session sur toutes les routes `(app)`
- Helper `getCurrentUser()` dans `lib/auth/`
- Helper `requireAuth()` qui throw si non authentifié
- Rôle stocké dans `app_metadata` du JWT

### UI
- Tailwind v4
- Composants shadcn/ui dans `components/ui/`
- Composants métier dans `components/[module]/`
- Pas de styles inline sauf cas extrêmes

### i18n
- next-intl
- Langues : FR (défaut), DE, IT, EN
- Pas de string en dur dans le JSX (utiliser `t('key')`)

### Forms
- React Hook Form + Zod
- Validation côté client pour UX + côté serveur pour sécurité (jamais que client)

### State management
- Server state : React Query / Tanstack Query
- UI state global léger : Zustand
- Forms : React Hook Form
- Pas de Redux

## Conventions

### Naming pages
- `app/(app)/clients/page.tsx` → `/clients`
- `app/(app)/clients/[id]/page.tsx` → `/clients/[id]`
- `app/(app)/clients/[id]/edit/page.tsx` → `/clients/[id]/edit`

### Loading & Error states
- `loading.tsx` pour chaque route avec Suspense boundary
- `error.tsx` pour catching les erreurs côté React
- `not-found.tsx` pour 404

### Layout segmentés
- Marketing : layout public sans auth
- App : layout avec sidebar fiduciaire OU dashboard mobile-first client
- Auth : layout minimal centered

## UX patterns ZARYA (rappel — voir `/docs/ux-principles.md`)

1. L'IA propose, l'humain valide
2. Validation 1-clic quand l'IA est fiable
3. Édition inline, pas de modal hell
4. Sauvegarde temps réel, pas de bouton Save global
5. Sources et traçabilité visibles
6. Action prioritaire en premier
7. Statuts simples et actionnables
8. Pas de jargon côté client final

## Ce que tu NE fais PAS

- Pas de localStorage/sessionStorage en SSR
- Pas de fetch direct depuis Client Components (utiliser server actions ou React Query)
- Pas de toast pour chaque action (digest préférable)
- Pas de modal sur modal
- Pas de couleur seule pour transmettre info (icône + couleur + texte)
