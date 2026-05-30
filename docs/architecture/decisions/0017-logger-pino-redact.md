---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [security-and-audit, microsoft-integration]
---

# ADR 0017 — Logging structuré via pino + redact (infra transverse, avant D2)

## Statut

**Acceptée** — 30 mai 2026. Pose l'infrastructure de logging serveur **avant** d'écrire le
Bloc D2 (`MicrosoftGraphClient`), premier consommateur réel : il loggue ses appels Graph
(méthode, statut HTTP, `cabinet_id`, latence), donc le redact des secrets doit exister
**avant** lui, pas après. Mini-ADR d'infra, ne modifie aucune décision de séquence.

## Contexte

CLAUDE.md règle 2 impose : « Aucun log de PII (utiliser `pino` avec redact ; redact
obligatoire sur `authorization`, `cookie`, `ZEFIX_PASSWORD`, `*_token`, `*_secret`) ». Or à
ce jour **aucune infra pino n'existe** dans le repo : on ne trouve que deux `// TODO: logger
via pino (phase 2)` (`apps/web/app/(auth)/signup/actions.ts`, `apps/web/lib/provisioning.ts`)
et deux `console.error` best-effort dans la route d'upload Doc
(`apps/web/app/api/documents/upload/route.ts`). Le projet a vécu jusqu'ici sans logger parce
que rien de sensible n'était logué.

Le Bloc D change la donne. D1 (OAuth Microsoft, mergé PR #59) ne loggue **rien** par
construction — choix explicite acté avec le founder : ne jamais logguer de token plutôt que
d'ajouter une dépendance transverse non arbitrée au milieu de D1. Mais **D2**
(`MicrosoftGraphClient`) loggue réellement ses appels Graph et trace `audit.api_externe`.
C'est le point où le logging démarre pour de vrai — donc le bon moment pour poser le redact,
dans une PR d'infra dédiée plutôt que noyé dans D2.

Fait structurant sur pino : son moteur de redact (`fast-redact`) matche par **chemin**, avec
`*` couvrant **une** clé à un niveau donné. Il **ne supporte pas** de glob suffixe récursif
de type `**_token`. La spec CLAUDE.md `*_token` / `*_secret` est donc une **intention** qu'on
traduit en liste explicite de chemins (clés concrètes loguées : `access_token`,
`refresh_token`, `id_token`, `client_secret`, + génériques `token`/`secret`/`password`/
`authorization`/`cookie`/`ZEFIX_PASSWORD`), étendue au fil des nouveaux sites de log.

## Décision

### 1. Un package dédié `@zarya/logger`

On crée `packages/logger` (calqué sur `@zarya/schemas` : `exports "." → src/index.ts`,
source TS consommée directement, pas d'étape de build), exposant une instance pino unique
`logger` + un helper `childLogger(bindings)`. Raison : le logging est transverse (web,
integrations, futurs jobs) — un package workspace évite la duplication et donne **un seul**
endroit où la config redact vit. C'est le pattern déjà retenu pour les autres préoccupations
transverses (`@zarya/multi-tenant`, `@zarya/auth`, `@zarya/schemas`).

### 2. Redact défense-en-profondeur, discipline d'abord

Deux lignes de défense, dans cet ordre :

1. **Discipline applicative (règle première)** : on ne passe **jamais** un secret brut dans
   le contexte d'un log. Les sites de log portent `cabinet_id` / ids techniques / `error.name:
   message`, jamais de token, IBAN, AVS, nom de fichier client, ni corps de requête tiers.
2. **Redact pino (filet de sécurité)** : liste de chemins sensibles, appliquée racine + un
   niveau imbriqué (`key` et `*.key`) + en-têtes (`req.headers.<key>`), censure `[redacted]`.

Le redact est un filet, pas la stratégie. La limite « pas de glob suffixe » de pino est
acceptable précisément parce que la règle première est la discipline ; le redact attrape les
oublis sur les clés connues.

### 3. Niveau et format

`level` lu de `LOG_LEVEL`, défaut `info` en prod / `debug` sinon. `base: undefined` (pas de
`pid`/`hostname`, bruit inutile en serverless Vercel). Pas de transport pretty embarqué (les
Runtime Logs Vercel ingèrent le JSON ligne-par-ligne) ; le pretty-print reste un choix dev
local hors scope de cette PR.

### 4. Migration des sites existants (sortir le logger du statut « dead code »)

Cette PR câble les 4 sites existants pour que le logger soit réellement exercé (sinon c'est
du code mort qui ne passe même pas au build) et pour solder les 2 TODO : les 2 `console.error`
de la route d'upload et les 2 `// TODO logger phase 2` (signup, provisioning). Périmètre
strictement limité à ces 4 sites — aucune nouvelle instrumentation ailleurs.

## Conséquences

**Positives**
- Le redact existe **avant** le premier vrai consommateur (D2), conformément à CLAUDE.md §2.
- Un seul endroit de config ; D2/E/F/G importent `@zarya/logger` sans redéfinir le redact.
- Les 2 TODO « logger phase 2 » sont soldés ; plus de `console.error` nu côté serveur.

**Négatives / limites assumées**
- pino ne fait pas de glob suffixe récursif → la liste de chemins est **maintenue à la main**
  et étendue à chaque nouveau champ sensible logué. Mitigée par la règle première (discipline)
  et un test unitaire qui prouve la censure.
- Nouvelle dépendance npm (`pino`). Justifiée : explicitement mandatée par CLAUDE.md §2 ;
  aucune alternative maison ne serait conforme.

## Alternatives écartées

- **Câbler pino dans D1 / D2 directement** : rejeté avec le founder — dépendance transverse
  au milieu d'un bloc fonctionnel, fausse le périmètre de la PR. Une PR d'infra dédiée isole
  la décision et son test.
- **Serializer maison qui deep-walk les objets et censure par regex `/_(token|secret)$/`** :
  honorerait mieux la spec `*_token`, mais coût perf à chaque log + risque de récursion sur
  refs circulaires, pour un gain marginal vu la règle première (discipline). pino redact +
  liste explicite est le compromis retenu.
- **Garder `console.error`** : non conforme CLAUDE.md §2 (pas de redact, pas de structure),
  et inutilisable dès que D2 loggue des objets pouvant contenir des en-têtes Graph.

## Références

- CLAUDE.md règle 2 (sécurité — pino + redact `authorization`/`cookie`/`ZEFIX_PASSWORD`/
  `*_token`/`*_secret`).
- `docs/architecture/security-and-audit.md` § 8 (audit log) et § anonymisation des logs.
- ADR 0013 + addendum (chiffrement au repos — tokens Microsoft en Vault ; le logger ne doit
  jamais déchiffrer ni logguer ces secrets).
- `KICKOFF-BLOCS-B-H.md` §BLOC D (D2 `MicrosoftGraphClient`, premier consommateur du logger).
