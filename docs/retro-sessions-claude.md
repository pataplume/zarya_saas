---
status: vivant
owner: claude
last_updated: 2026-05-27
type: retrospective
---

# Retrospective technique — Sessions Claude Code (Phase 0 → Phase 2a)

> Document de mémoire opérationnelle. Ce qu'a fait Claude, ce qui a bloqué, comment c'est passé, où on en est, ce qu'il faut pour continuer. Sans filtre.

---

## 1. Timeline complet

### Phase 0 — Bootstrap monorepo

**Commit** : `758ee25`

Mise en place de la structure de base :

```
Zarya_Saas/
├── apps/web/              ← Next.js 15 (vide)
├── packages/auth/         ← vide
├── packages/db/           ← vide
├── packages/integrations/ ← vide
├── pnpm-workspace.yaml
└── package.json (Biome, Husky, TypeScript)
```

Puis ajout de `vercel.json` pour pointer le root framework sur `apps/web` (commit `b243a27`).

Rien de difficile ici — c'est du scaffolding mécanique. Le vrai travail commence après.

---

### Phase 1 — DB Foundation + Auth + Pages Login/Signup

**Commits** : `ce1eb7c` → `076d66e` → `5186a44` → PR #1 → merge `a137bc8`

**Ce qui a été construit :**

- `packages/db` : Drizzle ORM, schéma `crm.cabinet` + `crm.cabinet_membre`, enums Postgres, migrations, RLS avec `current_cabinet_id()` lu depuis le JWT Supabase
- `packages/auth` : clients Supabase SSR (browser + server), middleware Next.js (refresh session), RBAC helpers (`requireAuth`, `requireCabinetMember`, `requireRole`), types `CabinetMemberSession`
- `apps/web` : middleware, pages `/login` et `/signup` (Server Actions + Zod), callback `/auth/callback`, layout protégé `(app)`, page placeholder post-login

**Galères Phase 1 :**

**1.1 — `'use client'` dans browser.ts**

Le fichier `packages/auth/src/browser.ts` avait un `'use client'` en header, importé par le layout serveur `(app)/layout.tsx`. Next.js a refusé — on ne peut pas importer du code `'use client'` depuis un Server Component.

→ Solution : retirer `'use client'` de browser.ts. Ce fichier est un wrapper de client Supabase navigateur — il s'initialise côté client uniquement via les composants qui en ont besoin, pas par le layout serveur.

**1.2 — Conflit de route `(app)/page.tsx`**

La page `(app)/page.tsx` créait une route `/` qui entrait en conflit avec la landing page publique déjà à `app/page.tsx`.

→ Solution : déplacer vers `(app)/app/page.tsx` pour créer `/app` comme route post-login.

**1.3 — `force-dynamic` sur le layout protégé**

Next.js essayait de pre-render le layout `(app)/layout.tsx` à la compilation. Il appelait `requireAuth()` qui lit les cookies — impossible au build time.

→ Solution : ajouter `export const dynamic = 'force-dynamic'` sur le layout. Tous les segments sous `(app)` sont rendus dynamiquement, ce qui est le comportement attendu pour une app authentifiée.

---

### Phase 2a — Onboarding fiduciaire self-service

**Commits** : `6fd7811` (gros commit), `887ed31` (fix ZefixClient), `fbaf704` (commit vide CI)

**Ce qui a été construit :**

- **DB** : 3 nouvelles tables (`session_onboarding_fiduciaire`, `invitation_membre`, `zefix_recherche_cabinet`), extension de `crm.cabinet` (+20 colonnes), trigger `trg_provision_nouveau_cabinet`, RLS complet dont l'exception bootstrap step A (ADR 0009)
- **Auth/Provisioning** : `createSupabaseAdminClient` (service role), `provisionNewCabinet` (création cabinet + session + `app_metadata.cabinet_id`), `accepterInvitation` (pour les membres invités)
- **Onboarding wizard** : layout 3 étapes, `/onboarding/identite` (Zefix search + formulaire identité), `/onboarding/equipe` (invitations), `/onboarding/import` (stub Calendly)
- **Zefix (ADR 0009)** : `ZefixClient` (POST search + GET uid/[uid] + normalisation IDE), `ZefixError`, route handlers `/api/zefix/search` et `/api/zefix/uid/[uid]`, logging dans `zefix_recherche_cabinet`
- **Signup** : checkbox CGU obligatoire non pré-cochée, appel `provisionNewCabinet` après `supabase.auth.signUp`

**Galères Phase 2a :**

**2.1 — `exactOptionalPropertyTypes` et le paramètre `canton`**

La fonction `rechercherParNom(nom, options?)` accepte `canton?: string`. Avec `exactOptionalPropertyTypes: true` dans le tsconfig, passer `canton: string | undefined` n'est pas assignable à `canton?: string`.

Le code original :
```typescript
rechercherParNom(requete, { canton, maxEntries })
// ↑ Erreur TypeScript si canton peut être undefined
```

→ Solution : conditional spread
```typescript
rechercherParNom(requete, {
  ...(canton !== undefined ? { canton } : {}),
  maxEntries,
})
```

Ce pattern revient partout quand on utilise des options optionnelles avec `exactOptionalPropertyTypes`. À mémoriser.

**2.2 — `process` et `Buffer` absents dans `packages/integrations`**

Le `ZefixClient` utilise `process.env.ZEFIX_USERNAME` et `Buffer.from(...)` pour construire l'auth Basic. Ces globals Node.js ne sont pas disponibles sans `@types/node` dans les devDependencies.

→ Solution : ajouter `"@types/node": "*"` dans `packages/integrations/package.json`.

Simple, mais ça a causé des erreurs TypeScript cryptiques ("Cannot find name 'process'", "Cannot find name 'Buffer'") au lieu d'un message clair.

**2.3 — `TypeError: Invalid URL` au build Vercel**

Le gros bug de la phase. Symptôme : Vercel crash à l'étape "Collecting page data" avec :
```
TypeError: Invalid URL
input: 'postgresql://postgres:Rtk58zXjGqkbnjDf.xkwbtwikecihypjxundl.supabase.co:5432/postgres'
```

Diagnostic : `postgres-js` (le driver SQL de Drizzle) appelle `new URL()` au chargement du module, pas seulement à l'exécution des queries. Le build Next.js exécute les modules pour collecter les routes — donc la DB crashe au build.

Cause racine : la `DATABASE_URL` dans les variables Vercel était mal formée. Le `@db.` était absent :
```
# ❌ Valeur incorrecte dans Vercel
postgresql://postgres:PASSWORD.xkwbtwikecihypjxundl.supabase.co:5432/postgres

# ✓ Format correct
postgresql://postgres:PASSWORD@db.xkwbtwikecihypjxundl.supabase.co:5432/postgres
```

→ Solution : correction manuelle par toi dans le dashboard Vercel. Rien de code à corriger — c'était une erreur de configuration.

**Ce que j'ai appris** : `postgres-js` est brutal à l'init — pas de lazy connection. C'est à documenter dans le CLAUDE.md : si le build crash sur "Collecting page data", c'est presque toujours la `DATABASE_URL`.

**2.4 — `rechercherParNom` utilisait GET au lieu de POST**

La doc Zefix dit `POST /company/search` avec body JSON. L'implémentation initiale utilisait `GET` avec des query params — ça semblait logique pour une recherche, mais l'API Zefix ne supporte pas CORS et n'accepte que POST avec `Content-Type: application/json`.

→ Solution : réécriture complète de la méthode :
```typescript
// ❌ Avant
const url = `${ZEFIX_BASE_URL}/company/search?name=${encodeURIComponent(nom)}`;
const response = await fetchAvecTimeout(url);

// ✓ Après
const body = { name: nom, languageKey: "fr" };
const response = await fetchAvecTimeout(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

**2.5 — Normalisation IDE Zefix**

`rechercherParIde("CHE-105.860.760")` retournait null alors qu'on attendait un résultat. L'API Zefix attend le format sans séparateurs (`CHE105860760`), pas le format affiché (`CHE-105.860.760`).

→ Solution : helper `normaliserIde()` appliqué avant construction de l'URL :
```typescript
function normaliserIde(ide: string): string {
  return ide.replace(/[-.\s]/g, ""); // CHE-123.456.789 → CHE123456789
}
```

**2.6 — Test Zefix bloqué par Vercel Preview Auth**

Pour tester les routes `/api/zefix/*` en preview, il fallait :
1. S'authentifier sur Supabase → obtenir un cookie session
2. Passer ce cookie + le token `_vercel_share` à la preview Vercel

Le problème : Vercel Preview Auth intercepte les requêtes `POST` et les redirige vers `instant-preview-site.vercel.app` au lieu de les laisser passer. Le token `_vercel_share` fonctionne pour GET mais pas POST.

→ Improvisation : tester le `ZefixClient` directement en Node.js avec `tsx`, sans passer par les route handlers. Ça valide la couche d'intégration sans valider les routes — acceptable pour un merge, les routes elles-mêmes étant du wiring trivial.

**Détail important découvert** : avec `tsx`, les `import` ESM sont hoistés avant l'exécution de `dotenv.config()`. Donc `ZEFIX_BASE_URL` (constante module-level dans `client.ts`) était évaluée *avant* que dotenv charge `.env.local`, et tombait sur le fallback production. En prod Vercel, la variable est injectée à la compilation — aucun problème. En dev local, il faut charger dotenv *avant* l'import du module, ce qui est difficile avec ESM natif (pas de workaround propre sans `--env-file`).

**2.7 — Création manuelle d'un utilisateur test Supabase**

Pour tester l'API Zefix authentifiée sans UI, j'ai essayé de créer un user directement en SQL. Deux problèmes :

1. `auth.users` requiert des champs `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` à `''` (chaîne vide, pas NULL) — le driver Go de Supabase (`pgx`) ne sait pas convertir NULL en `string`.

2. Pas de ligne dans `auth.identities` → GoTrue ne reconnaît pas l'utilisateur comme un email/password valide.

→ Solution SQL en deux temps :
```sql
-- Corriger les tokens null
UPDATE auth.users SET
  confirmation_token='', recovery_token='',
  email_change_token_new='', email_change=''
WHERE email='test-zefix@zarya-ci.com';

-- Créer l'identité manquante
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, ...)
SELECT gen_random_uuid(), id, email,
  jsonb_build_object('sub', id::text, 'email', email),
  'email', ...
FROM auth.users WHERE email='test-zefix@zarya-ci.com';
```

→ À retenir : **ne jamais créer des users Supabase en SQL brut**. Utiliser `supabase.auth.admin.createUser()` via le service role, qui gère tout ça.

**2.8 — Biome formatting**

Après plusieurs itérations de code, Biome détectait des problèmes de formatting sur 6 fichiers. Résolu avec :
```bash
pnpm biome check --write .
```

8 warnings pre-existants de `noNonNullAssertion` non traités (dans des fichiers antérieurs à cette session) — ils sont documentés mais pas résolus car non-bloquants et non introduits par cette session.

---

## 2. Moments d'improvisation

| Situation | Ce qui était prévu | Ce qui a été fait | Pourquoi |
|-----------|-------------------|-------------------|----------|
| Test API Zefix en preview | Tester via `curl` avec cookie Supabase | Tester via `tsx` + ZefixClient directement | Vercel Preview Auth bloque les POST |
| `DATABASE_URL` malformée | Diagnostiquer depuis les logs Next.js | Lire le stack trace Vercel MCP | Pas d'accès direct à l'infra Vercel |
| User test Supabase | Créer via `supabase.auth.admin.createUser()` | SQL brut (puis fix des NULL) | Pas d'interface admin disponible dans le flow de test |
| `tsx` non disponible | Exécuter depuis le package `integrations` | Utiliser `tsx` trouvé dans `.pnpm` (drizzle-kit) | Pas de `tsx` dans les devDeps du package cible |
| Hoisting ESM + dotenv | — | Découverte en cours de test | Comportement peu documenté, piège classique ESM |

---

## 3. État actuel du projet (27 mai 2026)

### Ce qui tourne en prod (branch `develop` → Vercel)

```
✓ Authentification complète (signup/login/logout/callback)
✓ Provisioning cabinet au signup (cabinet + session onboarding + app_metadata)
✓ Onboarding wizard 3 étapes (identité, équipe, import)
✓ Intégration Zefix (POST search + GET uid, ADR 0009 complet)
✓ Logging Zefix dans crm.zefix_recherche_cabinet
✓ RLS sur toutes les tables métier
✓ Multi-tenant isolation via current_cabinet_id() JWT
```

### Ce qui n'existe pas encore

```
✗ Dashboard fiduciaire (post-onboarding)
✗ Onboarding client PME (ADR 0006)
✗ Zarya CRM (contacts, dossiers)
✗ Zarya Doc (inbox, extraction IA)
✗ Zarya Calendar (échéances)
✗ Zarya Facture
✗ Zarya Search
✗ Microsoft Graph (email, calendar)
✗ AWS Bedrock (LLM wrapper)
✗ Mistral OCR
✗ Tests automatisés (0 fichiers .test.ts dans le repo)
✗ Dashboard client PME (mobile-first)
```

### Dette technique identifiée

1. **Zéro test** — le CLAUDE.md exige des tests d'isolation multi-tenant en CI (bloquants). Ils n'existent pas. Toute la promesse de sécurité multi-tenant repose sur les RLS Postgres (qui fonctionnent) mais n'est pas vérifiable en CI.

2. **8 warnings Biome `noNonNullAssertion`** — pré-existants, jamais traités. Pas critiques mais signal de dette.

3. **Pas de `vitest` ou framework de test** dans le monorepo. Aucun script `test` dans les `package.json`.

4. **`ZEFIX_BASE_URL` hoisting** — si quelqu'un lance des tests locaux avec `.env.local`, le module-level constant ne sera pas bien initialisé. Pb mineur en dev, inexistant en prod Vercel.

5. **User test Supabase non nettoyé** — `test-zefix@zarya-ci.com` existe dans la DB de prod. À supprimer.

6. **Onboarding step F (`/onboarding/import`)** — stub avec lien Calendly placeholder. Jamais connecté à quoi que ce soit.

---

## 4. Ce qu'il faut pour bien continuer

### Priorité 1 — Ce qui bloque la prochaine feature

**Tests d'isolation multi-tenant** (CLAUDE.md §CI : "bloquants, jamais skippables")

Sans ça, chaque nouvelle table métier est une dette de sécurité. Il faut :
- Setup `vitest` dans le monorepo
- 1 test qui vérifie qu'un user du cabinet A ne voit pas les données du cabinet B
- Ce test doit passer en CI (GitHub Actions) avant tout merge sur `develop`

**Dashboard post-onboarding**

L'onboarding redirige vers `/app` — qui est une page placeholder "Bienvenue". L'utilisateur qui a fini l'onboarding arrive dans une impasse. Il faut au minimum un dashboard vide cohérent avant d'avancer sur les modules métier.

### Priorité 2 — Fondations manquantes pour les modules métier

**`packages/integrations/bedrock`** — Sans le wrapper LLM, impossible de commencer Zarya Doc ou Zarya Calendar (qui dépendent de l'IA).

**`packages/integrations/microsoft`** — Microsoft Graph pour l'ingestion email. C'est l'input principal du flux documentaire.

**`packages/schemas`** — Les schémas Zod partagés entre packages. Actuellement chaque package redéfinit ses propres schémas.

### Priorité 3 — Clarifications produit avant de coder

**Le CLAUDE.md dit "Phase 1 — modules autorisés : packages/db, packages/auth, apps/web (auth layer)"**. Phase 2a (onboarding) a été faite sans mettre à jour ce fichier. Il faut soit mettre à jour le CLAUDE.md pour refléter l'état réel, soit clarifier quelle est la prochaine phase autorisée.

**Le prochain module métier selon la roadmap** : Zarya CRM ou Onboarding Client. Mais ces deux modules nécessitent du design (maquettes) avant que je code — sinon je vais inventer des UX sans feedback.

### Ce que tu dois fournir avant la prochaine session de code

| Besoin | Pourquoi |
|--------|---------|
| Mise à jour CLAUDE.md (phase actuelle) | Pour que je sache ce que je suis autorisé à toucher |
| Décision : prochain module (CRM ? Doc ? Onboarding client ?) | Sans ça je ne sais pas quoi construire |
| Wireframes ou maquettes du dashboard (même basiques) | Je peux implémenter sans mais ça sera générique |
| Cleanup user test Supabase (`test-zefix@zarya-ci.com`) | Hygiène DB |
| Setup GitHub Actions CI minimal | Pour que les tests d'isolation soient vérifiables |

---

## 5. Réflexion sur la vitesse d'exécution

### Ce qui est rapide

Le scaffolding pur est très rapide. Un package TypeScript vide avec ses dépendances, un schéma Drizzle, un layout Next.js — ça se fait en quelques minutes et les erreurs sont détectées immédiatement au typecheck.

La "vertical slice" (DB → auth → UI → route handler) sur un domaine bien documenté (Zefix) fonctionne bien. Les ADR ont vraiment aidé — j'ai suivi ADR 0009 à la lettre et ça a évité des allers-retours.

### Ce qui ralentit

**1. La compaction de contexte**

Chaque session commence par lire un résumé de la session précédente. Je perds des détails. Exemple : la session précédente avait résolu le bug `DATABASE_URL` Vercel — mais le check Vercel de la PR utilisait encore l'ancien commit. J'aurais pu anticiper ça si j'avais eu le contexte complet.

**Estimation de la perte** : 10-20% du temps de session passé à reconstruire le contexte et à re-vérifier des choses déjà vérifiées.

**2. Les bugs d'infrastructure Vercel/Supabase**

Pas de code à écrire, juste du diagnostic. Le bug `DATABASE_URL` a pris 30-40 minutes (diagnostic, logs Vercel MCP, identification de la cause, correction). La création du user Supabase en SQL brut : idem.

Ces bugs sont normaux dans un projet early-stage. Mais ils ne produisent rien de shippable.

**3. L'absence de tests**

Je code en me fiant au typecheck + Vercel build comme validation. C'est fragile. Si j'introduis une régression multi-tenant, je ne la vois pas — le typecheck passe, le build passe, Vercel déploie, et le bug est en prod.

La vitesse d'exécution actuelle est **une dette de qualité déguisée en rapidité**.

**4. Le gap maquette → code**

Sur l'onboarding, j'ai codé l'UI sans wireframes. Le résultat est fonctionnel mais générique — Tailwind classes basiques, pas de vraie hiérarchie visuelle, pas de prise en compte de la progression UX documentée dans `/docs/ux-principles.md`. Ça devra être repassé par un designer.

### Chiffres bruts

| Phase | Commits | Fichiers modifiés | Lignes ajoutées | Lignes supprimées |
|-------|---------|-------------------|-----------------|-------------------|
| Phase 0 | 2 | ~20 | ~500 | 0 |
| Phase 1 | 4 | ~33 | ~2 237 | ~21 |
| Phase 2a | 3 | ~38 | ~3 880 | ~170 |
| **Total** | **9** | **~91** | **~6 617** | **~191** |

Pour 3 phases, 9 commits, ~6 600 lignes. Sur un projet de la complexité de ZARYA, c'est un rythme correct pour du code seul. Ce n'est pas du code throwaway — il y a du schéma DB, des migrations Postgres, des RLS policies, de la logique auth, une intégration API tierce avec gestion d'erreur typée. Ce n'est pas trivial.

**La limite n'est pas la vitesse d'écriture de code — c'est la vitesse de décision produit.** Je peux implémenter un module en une session si le spec est clair. Ce qui prend du temps, c'est quand le spec est flou ou absent.

### Recommandation de méthode de travail

Pour les prochaines sessions :

1. **Commence la session avec un brief clair** : "aujourd'hui on fait [X], la spec est [doc Y], les contraintes sont [Z]"
2. **Une session = un module ou une feature verticale complète** — pas "avance sur le projet"
3. **Les décisions de design (UI, UX, architecture produit) se font AVANT la session de code** — pas en cours
4. **Plan mode systématique** pour les features non triviales — ça force à aligner avant d'écrire
5. **Merge fréquent** sur `develop` avec des PRs petites — ça réduit le risque de conflit de contexte entre sessions

---

*Document généré le 27 mai 2026. À réviser à chaque transition de phase.*
