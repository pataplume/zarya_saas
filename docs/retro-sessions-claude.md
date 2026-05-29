---
status: vivant
owner: claude
last_updated: 2026-05-29
type: retrospective
---

# Retrospective technique — Sessions Claude Code (Phase 0 → Phase 3)

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

---
---

# Addendum — Phase 3 : Module Doc (28 mai 2026)

> Suite directe de la retro Phase 0 → 2a. Même règle : sans filtre. Cette phase a livré l'inbox documentaire et le squelette complet du flux IA, mais en **stub** plutôt qu'avec les vrais providers (Bedrock/Mistral bloqués sur crédits). C'est la décision structurante de la phase, et tout en découle.

## 6. Timeline Phase 3

Plan initial (CLAUDE.md) : 4 sprints.

| Sprint | Plan initial | Livré | Commit |
|--------|--------------|-------|--------|
| 3.1 | Schéma DB + migrations `doc.*` | ✅ conforme | `219ef72` |
| 3.2 | Inbox (upload, liste, statut) | ✅ conforme | `746a460` |
| 3.3 | Pipeline **Mistral OCR + Bedrock** + proposition | ⚠️ **stub** à la place des providers réels | `8277647` |
| 3.4 | Validation humaine + entité finale | ✅ conforme (avec une réserve client_id) | `1ab64a4` + test `bb4b23e` |

### Sprint 3.1 — Schéma DB module Doc

- Migration `0004_doc_module.sql` : schéma `doc` (`upload_brut`, `fichier_physique`, `proposition_classement`, `document`) + schéma `extraction` (`invocation`), enums (`source_ingestion`, `statut_traitement`, `categorie_document`, `statut_classement`, `extraction_context`/`input_type`/`status`).
- RLS sur toutes les tables, trigger `fn_check_client_cabinet` (cohérence cabinet/client sur `doc.document`).
- Tests d'isolation multi-tenant ajoutés (règle absolue CLAUDE.md).
- Exposition des schémas depuis `@zarya/db`.

### Sprint 3.2 — Inbox documentaire

- Route handler `POST /api/documents/upload` (upload fichier → Storage + `upload_brut` + `fichier_physique`).
- Page `/app/documents` (zone d'upload + table des reçus avec badges de statut), composant client `documents-client.tsx`.
- Garde-fou rôle `lecteur` (lecture seule).

### Sprint 3.3 — Pipeline de classification (livré en **stub**)

- `packages/extraction` : interface `Classifier` + `StubClassifier` (classification déterministe par regex sur le nom de fichier) + `getClassifier()` piloté par `EXTRACTION_MODE=stub|live`.
- `classifyDocument()` : appelle le classifier, trace dans `extraction.invocation`, écrit `doc.proposition_classement` (statut `a_valider`).
- Branché dans le route handler d'upload (le doc passe `recu` → `a_valider` après classification).
- **Ni Mistral OCR ni Bedrock ne sont câblés** — le mode `live` throw explicitement à l'usage.

### Sprint 3.4 — Validation humaine → `doc.document`

- Helper pur `diffValidation()` (compare proposition vs champs retenus, journalise les corrections) + tests unitaires.
- Server actions `validerPropositionAction` / `rejeterPropositionAction` (Zod, RBAC, scope cabinet).
- Page queue `/app/documents/validation` + carte de proposition éditable, bannière "à valider" sur l'inbox.
- L'entité finale `doc.document` est créée **en code applicatif** (pas par trigger), conformément à `extraction-ia.md § 8`.
- Test d'intégration du flux complet (`tests/integration/doc-validation/`).

---

## 7. Différences avec le plan initial — et pourquoi

C'est la partie qui compte. Quatre divergences, par ordre d'importance.

### 7.1 — Pipeline IA livré en stub, pas avec Bedrock/Mistral *(divergence majeure)*

**Plan** : Sprint 3.3 = "Pipeline extraction IA (Mistral OCR + Bedrock + proposition)".

**Réalité** : aucun appel LLM ni OCR réel. Un `StubClassifier` déterministe classe les documents par mots-clés dans le nom de fichier.

**Pourquoi** :
- **Les crédits AWS Bedrock sont bloqués** — impossible d'appeler le LLM. Mistral OCR dépend du même flux aval.
- Plutôt que d'attendre, on a figé un **contrat** (`interface Classifier`) et une bascule `EXTRACTION_MODE`. Le stub remplit le contrat ; le jour où Bedrock est débloqué, on écrit un `BedrockClassifier` qui implémente la même interface, sans toucher au reste (route handler, proposition, validation).
- **Conséquence positive** : tout le flux en aval de l'IA (proposition → validation → `doc.document`) est **réel et testé**. Seule la "boîte noire" de classification est simulée. C'est la bonne couche où mettre le stub.
- **Respect des règles** : `classify-document.ts` trace quand même dans `extraction.invocation` (règle ADR 0003 / CLAUDE.md § 6), avec `model_used="stub"` — la traçabilité est honnête sur le fait que c'est un stub.

### 7.2 — `doc.document` créé en code applicatif, pas par trigger DB

**Plan / CLAUDE.md § 4** : "Création de l'entité finale **via trigger** à la validation."

**Réalité** : la server action écrit `doc.document` elle-même, dans la même transaction logique que le passage de la proposition à `valide`.

**Pourquoi** :
- `extraction-ia.md § 8` précise que la création se fait en code applicatif pour le module Doc (le trigger générique de la règle § 4 vise les cas champ-par-champ type salaire). Les deux docs étaient en tension ; j'ai suivi la doc module, plus spécifique.
- Un trigger aurait dupliqué la logique de `diffValidation` (statut `valide_humain` vs `corrige_humain`) en PL/pgSQL, plus dur à tester que du TypeScript pur.
- Le trigger DB conservé est uniquement `fn_check_client_cabinet` (garde-fou d'intégrité cross-tenant), pas la création d'entité.

### 7.3 — `doc.document.client_id` est NOT NULL → le flux ne tourne pas bout-à-bout

**Pas une divergence de code, mais une dépendance inter-phase qui bloque la démo.**

- Le schéma impose `client_id NOT NULL` sur `doc.document` : valider un document **exige** de lui attribuer un client.
- Or le `StubClassifier` ne propose jamais de client, et **la création de clients (module CRM) est Phase 4 — INTERDITE** actuellement.
- **Conséquence** : un cabinet sans client ne peut rien valider. La page de validation affiche un bandeau explicite ("créez d'abord un client") plutôt que de planter.
- C'est honnête mais ça veut dire que **le flux Doc n'est pas démontrable end-to-end aujourd'hui** sans bidouiller un client en DB. À assumer.

### 7.4 — Le `db` applicatif bypasse la RLS (sécurité par filtre `cabinet_id` + trigger)

**Découverte en cours d'implémentation, pas une décision de cette phase**, mais ça change la façon de tester.

- Le `db` exporté par `@zarya/db` se connecte en direct (postgres-js, service role) et **contourne la RLS**. La sécurité multi-tenant des queries app repose donc sur le **filtre `eq(table.cabinet_id, cabinet_id)` explicite** dans chaque WHERE + le trigger de cohérence — pas sur la RLS.
- `getDbForCabinet()` est un stub non utilisé (propagation JWT prévue "Phase 2" dans le code, jamais faite).
- **Conséquence sur les tests** : le test d'intégration de validation **rejoue les écritures de la server action en service role** (mêmes requêtes, même helper `diffValidation`) plutôt que d'importer l'action (liée à l'auth Supabase, non importable). C'est fidèle au vrai modèle de sécurité, mais ça veut dire que le test vérifie le *contrat de requêtes*, pas le *câblage de l'action elle-même*.

---

## 8. Galères Phase 3

**8.1 — Regex stub : "décompte" classé en relevé bancaire.** L'alternative `compte` du motif relevé bancaire matchait la sous-chaîne dans "dé**compte**_salaire". Corrigé en ancrant les frontières de mot : `\bcs\b|\bcompte`.

**8.2 — `@zarya/extraction` non résolu par le runner de test racine.** Les packages workspace exposent leur source TS directement (`exports "." → src/index.ts`), mais le runner racine n'a pas de symlink `node_modules/@zarya/*`. Ajout d'alias `resolve` dans `vitest.config.ts` (`@zarya/extraction`, `@zarya/db`). Importer l'index d'extraction tire transitivement `@zarya/db`, mais le client postgres-js est lazy (pas de connexion tant qu'aucune query) → pas de fuite.

**8.3 — Drizzle et les numériques.** `numeric(3,2)`/`numeric(10,6)` attendent des **strings** (`confiance_globale.toFixed(2)`, `cost_usd: "0"`), pas des numbers. Piège silencieux.

**8.4 — Test "validation conforme" qui sortait `corrige_humain`.** La proposition seedée n'avait pas de `client_id_propose` ; assigner un client à la validation comptait comme correction. Corrigé en seedant le client déjà proposé pour le cas conforme — ce qui reflète exactement le comportement réel du stub (qui ne propose jamais de client → toute validation est techniquement une "correction").

---

## 9. État actuel après Phase 3 (28 mai 2026)

### Ce qui tourne (code, testé)

```
✓ Schéma DB doc.* + extraction.invocation (migration 0004) + RLS + isolation testée
✓ Upload de documents (route handler → Storage + upload_brut + fichier_physique)
✓ Inbox /app/documents (liste, statuts, bannière à-valider)
✓ Classification STUB → doc.proposition_classement + trace extraction.invocation
✓ Validation humaine → doc.document (valide_humain / corrige_humain), rejet
✓ Helper diffValidation + tests unitaires
✓ Test d'intégration du flux de validation (5 cas)
✓ 67 tests verts (unit + intégration)
```

### Ce qui n'existe pas / ne tourne pas bout-à-bout

```
✗ Classification réelle (Bedrock bloqué crédits — stub uniquement)
✗ OCR réel (Mistral non câblé)
✗ Flux Doc démontrable end-to-end (client_id NOT NULL + CRM Phase 4)
✗ Détection de doublon (statut 'doublon' existe, logique absente)
✗ Détection d'anomalies réelle (le stub pose une anomalie générique sur l'inconnu)
✗ Test E2E Playwright du flux (Flow A : email → classification → validation)
✗ Aucun test authentifié de la server action elle-même (rejouée en service role)
```

### Dette technique nouvelle ou persistante

1. **Le stub est un faux-ami.** Tout est vert, la démo "marche", mais zéro intelligence réelle. Le risque : croire le module Doc terminé alors que sa valeur (l'IA) n'est pas branchée. À garder très visible.
2. **`client_id NOT NULL` couple Doc et CRM.** Tant que CRM (Phase 4) n'existe pas, Doc est en cul-de-sac fonctionnel. Décision produit à prendre (cf. § 10).
3. **La server action n'est pas testée directement** — seulement son contrat de requêtes rejoué. Un bug dans le wiring auth/Zod de l'action passerait inaperçu.
4. **`getDbForCabinet()` toujours un stub** — la RLS n'est pas le rempart réel des queries app ; tout repose sur la discipline du filtre `cabinet_id`. Un oubli de WHERE = fuite cross-tenant silencieuse. Pas de garde-fou automatique.

---

## 10. Recommandations pour la suite (peut diverger du plan)

Le plan initial enchaîne Phase 4 = CRM / Calendar / Facture / Search / Salaires. Je recommande de **ne pas attaquer ces modules tout de suite** et de refermer d'abord les boucles ouvertes par Phase 3.

### Reco 1 — Débloquer un mini-CRM *avant* tout le reste de Phase 4 *(divergence d'ordre)*

`doc.document.client_id NOT NULL` rend Doc inutilisable sans clients. Plutôt que tout le module CRM, livrer un **CRUD client minimal** (`crm.client` existe déjà : raison sociale, IDE, archive). Ça débloque la démo end-to-end de Doc immédiatement, pour une fraction du coût du module CRM complet. **C'est le plus haut ROI disponible.**

### Reco 2 — Écrire le `BedrockClassifier` dès le déblocage des crédits, sans rien changer d'autre

Le contrat `Classifier` est prêt. Le jour où Bedrock répond : un fichier, une bascule `EXTRACTION_MODE=live`, et le flux réel tourne. Prévoir dans la foulée un **vrai jeu de fixtures** (PDFs Swiss : QR-facture, décompte salaire, déclaration TVA) pour valider la classification réelle — le stub par nom de fichier ne dit rien de la qualité LLM.

### Reco 3 — Tester la server action pour de vrai (pas seulement son contrat rejoué)

Mettre en place un utilisateur de test authentifié (via `supabase.auth.admin.createUser()`, **pas** en SQL brut — leçon § 2.7) pour exercer `validerPropositionAction` de bout en bout (Zod + RBAC + écritures). Sinon le wiring de l'action reste un angle mort.

### Reco 4 — Garde-fou anti-fuite cross-tenant au niveau requête

Tant que `getDbForCabinet()` n'applique pas la RLS, un WHERE oublié = fuite. Deux options : (a) implémenter la propagation JWT + `SET LOCAL` pour activer enfin la RLS sur le chemin app, ou (b) un test d'intégration générique qui, pour chaque table métier, tente une lecture cross-tenant et exige 0 ligne. **Je recommande (b)** d'abord (rapide, attrape les régressions) et (a) comme objectif de fond.

### Reco 5 — Ne pas marquer "Module Doc ✅" tant que l'IA est en stub

Mettre à jour le CLAUDE.md pour refléter l'état réel : Doc = "squelette complet, IA en stub, en attente crédits Bedrock + mini-CRM". Éviter que la prochaine session croie Doc terminé.

### Ce dont j'ai besoin de toi avant la prochaine session

| Besoin | Pourquoi |
|--------|----------|
| Décision ordre : mini-CRM avant Phase 4 ? (Reco 1) | Débloque la démo Doc end-to-end |
| Statut des crédits AWS Bedrock | Conditionne le passage stub → live |
| Autorisation de toucher `crm.client` (actuellement Phase 4) | Pour le mini-CRM de la Reco 1 |
| Fixtures PDF suisses réalistes (anonymisées) | Pour valider la classification réelle, pas le stub |

---

## 11. Chiffres Phase 3

| Sprint | Commit | Fichiers | Lignes + | Lignes − |
|--------|--------|----------|----------|----------|
| 3.1 | `219ef72` | 7 | 1 106 | 5 |
| 3.2 | `746a460` | 6 | 546 | 2 |
| 3.3 | `8277647` | 8 | 387 | 3 |
| 3.4 (feat) | `1ab64a4` | 8 | 703 | 18 |
| 3.4 (test) | `bb4b23e` | 2 | 294 | 0 |
| **Total Phase 3** | **5 commits** | **~28** | **~3 015** | **~28** |

Comparé aux phases précédentes (~6 600 lignes pour 0→2a), Phase 3 ajoute ~3 000 lignes en 5 commits — dont un schéma DB conséquent, un package extraction, et **les premiers tests d'intégration métier du repo** (la dette "zéro test" du § 3 commence à se résorber).

**Le point dur de cette phase n'a pas été technique mais stratégique** : livrer de la valeur quand la brique centrale (l'IA) est inaccessible. Le pari du stub-derrière-contrat a permis d'avancer sans se mentir — à condition de ne jamais oublier que l'intelligence n'est pas encore là.

---

*Addendum généré le 28 mai 2026.*

---

# Addendum — Phase 4.0 : Migration couche IA → Infomaniak (29 mai 2026)

> Suite directe. Même règle : sans filtre. La Phase 3 s'était terminée sur un pari (« on écrira le `BedrockClassifier` le jour où les crédits AWS se débloquent », cf. Reco 2). Ce pari est **caduc** : on n'attend plus AWS, on a basculé toute la couche IA sur **Infomaniak AI Services** (souveraineté suisse, API OpenAI-compatible) — c'est l'objet de l'ADR 0010 qui supersede l'ADR 0003. Cette session couvre la fin de la bascule code, sa mise en prod, et deux chantiers d'après-coup : un harnais d'évaluation du classifier et un grand nettoyage de la doc.

## 12. Timeline Phase 4.0

| Étape | Livré | Commit / PR |
|-------|-------|-------------|
| ADR 0010 + bascule code IA | `InfomaniakClassifier` derrière `EXTRACTION_MODE=live`, stub reste le défaut | PR #20 (merged) |
| Promote → prod | Phase 4.0 en production | PR #21 (merged) |
| Harnais d'évaluation | Golden set synthétique FR/DE/IT, métriques pures, garde stub en CI + revue live opt-in | PR #22 (**ouverte**) |
| Sweep documentaire | Tout `/docs` aligné sur Infomaniak, purge Bedrock/Mistral résiduels | PR #23 (**ouverte**) |

### Détail PR #20 — la bascule (déjà en prod)

- `8d5d18f` — ADR 0010 (Infomaniak, souveraineté CH, supersede ADR 0003).
- `57220f3` — client `@zarya/integrations/infomaniak` (OpenAI-compatible, catalogue Beta, **aucun `model_id` codé en dur** : résolution runtime via `GET /v1/models`, mappage par catégorie `chat_small`/`chat_large`/`embeddings`/`vision`).
- `ba96ebb` — fix : aligner le client sur la sonde live (sortie structurée `json_schema`).
- `ed136fa` — `InfomaniakClassifier` (catégorie `chat_small`) + branchement `getClassifier()` sur `EXTRACTION_MODE`.
- `d0e7c97` + `2ca019b` — alignement conformité / stratégie LLM / CLAUDE.md de packages.

Le `StubClassifier` **reste le défaut en prod** (`EXTRACTION_MODE=stub`). Le live est opt-in, le temps de valider la qualité et de gérer le quota (cf. § 14).

### Détail PR #22 — harnais d'évaluation (ouverte)

- `d8274a2` — harnais : `golden-set.ts`, `evaluate.ts` (métriques **fonction pure** : type/catégorie accuracy, hallucination, overconfidence, par langue), `run-eval.ts` (boucle partagée), garde CI sur le stub, test live opt-in (`RUN_LIVE_EVAL=1` + `EXTRACTION_MODE=live`).
- Puis expansion du golden set **43 → 56 cas** (20 FR / 19 DE / 17 IT), tous dans les 11 `TYPES_CONNUS`, et assouplissement des seuils de la garde stub (planchers *sous* la baseline mesurée — garde anti-régression-franche, pas cible).

### Détail PR #23 — sweep doc (ouverte)

- `d9f881a` — 25 fichiers `/docs` migrés : références modèles → **catégories** Infomaniak (jamais des `model_id`), framing **Phase 4.1+** pour OCR/embeddings/RAG/facture, colonnes DB réelles conservées, enregistrements ADR historiques laissés intacts.

---

## 13. Ce que les runs d'éval ont appris

C'est le cœur de cet addendum : pour la première fois on a des **chiffres réels** sur la qualité de classification, pas une intuition.

### 13.1 — Le live bat le stub, nettement

Sur les 56 cas du golden set :

| | Stub (regex nom de fichier) | Live Infomaniak (`chat_small`) |
|---|---|---|
| Type accuracy global | **50,0 %** | **78,6 %** |
| Hallucination | 0 % | 0 % |
| Overconfidence | 0 % | 0 % |

Le live gagne sur **les trois langues**. C'est la première preuve mesurée que la bascule apporte de la valeur réelle, pas juste un changement de provider. Le stub n'était bien qu'un faux-ami (cf. § 9 dette #1) — maintenant on peut le chiffrer.

Modèle utilisé pour le live : catégorie `chat_small` → `mistralai/Ministral-3-14B-Instruct` (résolu au runtime, pas codé en dur).

### 13.2 — L'italien est le maillon faible (58,8 %)

L'IT plafonne à **58,8 %** quand FR/DE sont nettement au-dessus. Diagnostic (honnête sur les limites) :

- **Petit modèle** (`chat_small`, 14B) + **langue moins dotée** que FR/DE → moins de signal.
- **Mappage IT → libellés FR** : les 11 types connus sont en français ; le modèle doit traduire mentalement « busta paga » → `decompte_salaire ` etc.
- **Je n'ai PAS le détail par cas** des ratés IT : le 2ᵉ run (celui qui devait sortir le rapport cas-par-cas) a été **coupé par un HTTP 429** (cf. § 13.3). Donc ce diagnostic reste une hypothèse argumentée, pas une analyse de chaque miss.

### 13.3 — Le quota Infomaniak Beta est BAS *(découverte structurante)*

Un seul run complet de 56 cas a suffi à déclencher un **HTTP 429 « Quota Infomaniak atteint »** sur le run suivant. Je n'ai pas relancé (ça n'aurait fait qu'enfoncer la limite).

**Conséquence directe** : on ne peut pas, en l'état, traiter du volume réel ni itérer librement sur les prompts. **C'est un nouveau facteur qui n'était pas au plan** et qui doit être traité *avant* tout passage du live en défaut (cf. § 15).

### 13.4 — Dette documentaire : ~20 specs en retard sur la bascule

L'audit de tout `/docs` (3 agents en parallèle) a montré que **la décision (ADR 0010), le code, et la conformité critique** étaient bien migrés, mais qu'**une vingtaine de specs de modules futurs** (search, facture, flows…) citaient encore Bedrock/Mistral/Claude/Titan comme « couche IA active ». Normal : le périmètre doc de la Phase 4.0 était volontairement étroit (classification). Corrigé dans PR #23.

### 13.5 — Les colonnes `bedrock_*` restent en DB (legacy assumé)

`extraction.invocation` garde `bedrock_region` (NOT NULL DEFAULT) et `bedrock_request_id`. Les renommer = une **migration DB = hors périmètre Phase 4.0**. Annotées « héritées ADR 0003, conservées sous ADR 0010 ». À nettoyer dans une future migration, pas maintenant.

---

## 14. Différences avec le plan initial — et pourquoi

### 14.1 — On n'écrit pas un `BedrockClassifier`, on abandonne AWS *(divergence majeure)*

**Plan (Reco 2 Phase 3)** : « écrire le `BedrockClassifier` dès le déblocage des crédits ».

**Réalité** : crédits jamais débloqués → décision de **changer de stratégie**, pas d'attendre. ADR 0010, `InfomaniakClassifier`, souveraineté suisse. Le pari « stub-derrière-contrat » de la Phase 3 a payé : l'interface `Classifier` étant figée, brancher Infomaniak n'a touché ni le route handler, ni la proposition, ni la validation.

### 14.2 — Pas de fixtures PDF réelles, un golden set synthétique

**Plan (Reco 2 Phase 3)** : « vrai jeu de fixtures PDF suisses (QR-facture, décompte salaire…) ».

**Réalité** : le golden set évalue la classification **au niveau métadonnées/nom** (56 cas FR/DE/IT), pas des PDF réels. Pourquoi : l'OCR/vision est **Phase 4.1+** (non construit), donc tester sur PDF réels n'a pas encore de sens. Les vraies fixtures reviendront avec le module vision.

### 14.3 — Nouveau chantier non prévu : gestion du quota / rate-limit

Le 429 (§ 13.3) n'était pas anticipé. **Avant** de traiter du volume ou de passer le live en défaut, il faut : backoff/retry, batching, et/ou demande d'augmentation de quota Infomaniak. C'est une **étape ajoutée** par rapport au plan.

### 14.4 — Nouveau chantier non prévu : remédiation qualité IT

Les 58,8 % IT imposent une étape de mitigation (few-shot, ou router l'IT vers la catégorie `chat_large`) **avant** de se fier à la classification italienne. Pas au plan initial.

---

## 15. État actuel après Phase 4.0 (29 mai 2026)

### Ce qui tourne (code, en prod)

```
✓ Couche IA = Infomaniak (ADR 0010), client OpenAI-compat, catégories résolues au runtime
✓ InfomaniakClassifier (chat_small) derrière EXTRACTION_MODE=live (opt-in)
✓ Trace extraction.invocation honnête (provider/catégorie/coût)
✓ StubClassifier reste le défaut en prod
✓ Harnais d'éval : métriques pures, garde stub en CI, revue live opt-in (PR #22)
✓ Doc alignée Infomaniak (PR #23)
✓ Preuve chiffrée : live 78,6 % > stub 50,0 % en type accuracy (56 cas)
```

### Ce qui n'existe pas / bloque encore

```
✗ Live en défaut — bloqué par quota Beta (429) + qualité IT (58,8 %)
✗ Traitement de volume — impossible tant que le quota n'est pas géré
✗ OCR / vision réel — Phase 4.1+
✗ Embeddings / RAG / pgvector — Phase 4.1+ (0 embedding en base)
✗ Fixtures PDF suisses réelles — attendent le module vision
✗ Flux Doc end-to-end (toujours client_id NOT NULL + CRM minimal seulement)
✗ Détail cas-par-cas des ratés IT — perdu sur le 429
```

### Dette technique nouvelle ou persistante

1. **Quota Beta bas (429)** — bloque volume + itération. Priorité n°1 avant tout passage live-par-défaut.
2. **Qualité IT (58,8 %)** — non fiable en l'état pour l'italien.
3. **Colonnes `bedrock_*` en DB** — legacy assumé, à purger dans une future migration.
4. **PR #22 et #23 ouvertes** — la bascule code est en prod, mais l'éval et la doc à jour n'y sont pas encore (attendent CI verte + merge).
5. **Héritage Phase 3 toujours là** — `client_id NOT NULL` couple Doc et CRM ; `getDbForCabinet()` toujours stub (sécurité par filtre `cabinet_id`, pas RLS).

---

## 16. Recommandations pour la suite (peut diverger du plan)

### Reco 1 — Merger #22 et #23 avant tout nouveau chantier

L'éval et la doc à jour doivent atterrir en prod pour que la prochaine session parte d'une base honnête (CI verte d'abord).

### Reco 2 — Régler le quota AVANT de viser le live par défaut *(nouvelle priorité)*

Backoff/retry + batching côté client Infomaniak, et/ou demande d'augmentation de quota. Sans ça, ni volume ni itération prompt possibles. C'est le verrou n°1.

### Reco 3 — Remédier la qualité italienne, mesurer

Tester (a) few-shot dans le prompt avec exemples IT→libellé FR, ou (b) router l'IT vers `chat_large`. Re-mesurer sur le golden set. Ne pas se fier à l'IT tant que ce n'est pas remonté.

### Reco 4 — Garder le live opt-in jusqu'à quota + IT réglés

Ne basculer `EXTRACTION_MODE=live` en défaut qu'une fois (2) et (3) traités. Le 78,6 % global est encourageant mais le 429 et l'IT sont des bloquants opérationnels réels.

### Reco 5 — Fixtures PDF réelles avec le module vision (Phase 4.1+), pas avant

Le golden set synthétique suffit pour la classification métadonnées. Les vrais PDF arrivent avec l'OCR/vision.

### Ce dont j'ai besoin de toi avant la prochaine session

| Besoin | Pourquoi |
|--------|----------|
| Merge #22 + #23 (ou feu vert pour les merger) | Aligner prod sur l'éval + la doc |
| Décision quota : demander une augmentation Infomaniak ? | Débloque volume + itération (Reco 2) |
| Priorité : régler l'IT maintenant ou différer ? (Reco 3) | Conditionne la fiabilité multilingue |
| Quand viser le live par défaut ? | Aujourd'hui bloqué par quota + IT |
| Recalcul des totaux `pricing.md` / `vision.md` | En attente du catalogue Infomaniak Beta tarifé (différé) |

---

## 17. Chiffres Phase 4.0

| Lot | Commit / PR | Nature |
|-----|-------------|--------|
| Bascule IA | PR #20 (5 commits, mergée) | ADR 0010 + client + classifier + conformité |
| Promote prod | PR #21 (mergée) | Phase 4.0 en production |
| Éval | PR #22 `d8274a2` (ouverte) | harnais + golden set 56 cas FR/DE/IT |
| Sweep doc | PR #23 `d9f881a` (ouverte) | 25 fichiers `/docs` alignés Infomaniak |

**Résultats d'éval (56 cas)** : type accuracy stub 50,0 % → live 78,6 % ; hallucination 0 % ; overconfidence 0 % ; point faible IT 58,8 %.

**Le point dur de cette phase n'a pas été d'écrire le classifier** (le contrat Phase 3 a tenu) **mais de découvrir les limites opérationnelles du provider** : un quota Beta qui coupe au premier run sérieux, et une qualité italienne en retrait. La bonne nouvelle : on le sait maintenant chiffré, pas deviné. La suite n'est plus « brancher l'IA » mais « la rendre exploitable en volume et fiable en IT ».

---

*Addendum généré le 29 mai 2026.*
