---
status: as-built
owner: tristan
last_updated: 2026-05-28
priority: P0
flow: A (sous-ensemble MVP)
depends_on: [doc, extraction-ia, multi-tenant, crm]
referenced_by: [doc]
phase: 3.5
---

# Flow Doc — Validation documentaire (MVP stub)

> Ce document décrit le parcours **réellement implémenté** à la fin de la Phase 3.5 :
> upload manuel d'un document → classification par heuristique locale (stub IA) →
> proposition → validation humaine → création du `doc.document` rattaché à un client.
>
> Il complète [`flow-a-document-entrant.md`](./flow-a-document-entrant.md), qui décrit
> la **cible produit complète** (email Microsoft, NAS, OCR, Bedrock, auto-classement,
> effets de bord). Les écarts entre la cible et l'implémentation actuelle sont listés
> en fin de document (§ « Écarts avec la cible »).
>
> ⚠️ **L'IA est en STUB.** La classification est une heuristique sur le nom de fichier
> (`StubClassifier`), pas un appel LLM. Ne pas présenter ce flux comme « classification
> IA fonctionnelle ». Le branchement Bedrock est différé en Phase 4.0 (crédits AWS).

## Périmètre de ce flux

| Étape | Implémenté Phase 3.5 | Référence code |
|---|---|---|
| Upload manuel cabinet | ✅ | [`api/documents/upload/route.ts`](../../apps/web/app/api/documents/upload/route.ts) |
| Déduplication par hash SHA-256 | ✅ | idem, § 5 |
| Stockage Supabase Storage (bucket privé) | ✅ | idem, § 6 |
| Classification (stub heuristique) | ✅ (stub) | [`packages/extraction/src/classifier.ts`](../../packages/extraction/src/classifier.ts) |
| Trace `extraction.invocation` | ✅ | [`classify-document.ts`](../../packages/extraction/src/classify-document.ts) |
| Proposition `a_valider` | ✅ | idem |
| Pré-requis client (mini-CRM) | ✅ (Sprint 3.5.3) | [`app/clients`](../../apps/web/app/(app)/app/clients/page.tsx) |
| File de validation + validation 1-clic | ✅ | [`documents/validation`](../../apps/web/app/(app)/app/documents/validation/page.tsx) |
| Création `doc.document` à la validation | ✅ | [`validation/actions.ts`](../../apps/web/app/(app)/app/documents/validation/actions.ts) |
| OCR (Mistral) | ❌ Phase 4 | — |
| Classification Bedrock | ❌ Phase 4.0 | — |
| Auto-classement (politique cabinet) | ❌ Phase 4 | — |
| Effets de bord (Calendar, Facture, Search…) | ❌ Phase 4+ | — |
| Ingestion email / NAS / dashboard client | ❌ Phase 4+ | — |

## Acteurs

- **Système ZARYA** : persistance brute, classification stub, traçabilité.
- **Collaborateur cabinet** : upload, puis validation des propositions. Rôles autorisés :
  `responsable`, `gestionnaire_salaires`, `collaborateur`. Le rôle `lecteur` est en
  lecture seule (upload et validation refusés côté serveur).

## Pré-requis

1. Cabinet onboardé, utilisateur authentifié avec `cabinet_id` + `role` dans
   `app_metadata` du JWT.
2. **Au moins un client actif** dans `crm.client` (sinon la validation ne peut pas
   aboutir : `doc.document.client_id` est `NOT NULL`). Créable via `/app/clients`
   depuis le Sprint 3.5.3 — c'est le verrou que cette phase a levé pour rendre le
   flux démontrable de bout en bout.
3. Bucket Supabase Storage `documents` provisionné (privé).
4. `EXTRACTION_MODE=stub` (défaut) — aucun crédit AWS requis.

## Étapes détaillées (as-built)

### Étape 1 — Upload manuel

1. Le collaborateur dépose un fichier sur `/app/documents`
   ([`documents-client.tsx`](../../apps/web/app/(app)/app/documents/documents-client.tsx)).
2. `POST /api/documents/upload` (route handler, jamais server action — cf.
   `apps/web/CLAUDE.md`). Vérifie : authentification, `cabinet_id`, rôle d'écriture,
   type MIME autorisé, taille ≤ 50 MB (validation Zod).
3. Hash SHA-256 du contenu.
4. Insert `doc.upload_brut` (statut initial `recu`, `source = 'upload_fiduciaire'`).
5. **Déduplication** : si un `doc.fichier_physique` du même cabinet porte déjà ce hash,
   l'upload est marqué `doublon` et la réponse s'arrête là (pas de re-stockage).
6. Sinon : stockage dans `documents/{cabinet_id}/{upload_id}.{ext}` (service role),
   puis insert `doc.fichier_physique` (lié à l'`upload_brut`).

### Étape 2 — Classification (stub)

1. `classifyDocument()` appelle `getClassifier()` → `StubClassifier` (selon
   `EXTRACTION_MODE`).
2. Le stub déduit `type` / `categorie` / `periode` / `libelle` par **regex sur le nom
   de fichier** (ex. `releve_ubs_2026-04.pdf` → `releve_bancaire` / `bancaire`,
   période `2026-04`). Fichier non reconnu → `a_classer` / `autre` + anomalie.
3. Insert `extraction.invocation` (une ligne par appel, **même en stub** :
   `model_used = 'stub'`, `cost_usd = 0`, `tokens = 0`) — traçabilité ADR 0003.
4. Insert `doc.proposition_classement` en statut `a_valider`, reliée à l'invocation.
5. L'`upload_brut` passe au statut `a_valider`. Si la classification échoue, le fichier
   reste stocké (statut `recu`) et reste reclassable — l'upload n'est jamais perdu.

> **Pattern proposition → validation (ADR 0007)** : aucune entité finale n'est créée à
> ce stade. `doc.document` naît exclusivement à la validation humaine.

### Étape 3 — File de validation

1. `/app/documents` affiche une bannière « N documents à valider » (lien vers la file)
   dès qu'au moins une proposition `a_valider` existe.
2. `/app/documents/validation` liste les propositions du cabinet et charge la liste des
   clients actifs (`crm.client` non archivés) pour le menu d'attribution.
3. **Si aucun client n'existe**, une bannière invite à en créer un via `/app/clients`
   (lien ajouté au Sprint 3.5.3) — la validation est sinon impossible.

### Étape 4 — Validation humaine

`validerPropositionAction` ([`validation/actions.ts`](../../apps/web/app/(app)/app/documents/validation/actions.ts)) :

1. Auth + `cabinet_id` + contrôle de rôle (`lecteur` refusé).
2. Validation Zod des champs retenus, dont `client_id` **obligatoire**.
3. Recharge la proposition encore `a_valider`, **scopée `cabinet_id`**
   (defense-in-depth en plus de la RLS).
4. `diffValidation(propose, retenu)` calcule si l'humain a corrigé la proposition.
5. Insert `doc.document` avec les valeurs retenues, `statut_classement` =
   `corrige_humain` ou `valide_humain` selon le diff.
   - Le trigger `doc.fn_check_client_cabinet` **rejette** tout `client_id`
     n'appartenant pas au `cabinet_id` du document (cohérence multi-tenant au niveau DB).
6. La proposition passe à `valide` (avec `document_id`, `valide_par`, corrections
   éventuelles journalisées).
7. L'`upload_brut` correspondant passe à `valide` (reflété dans l'inbox).

**Rejet** : `rejeterPropositionAction` met la proposition en `rejete` (motif optionnel)
et l'upload en `rejete`. Aucun `doc.document` n'est créé.

## Garanties multi-tenant sur ce flux

- Chaque table touchée (`upload_brut`, `fichier_physique`, `invocation`,
  `proposition_classement`, `document`, `client`) porte `cabinet_id NOT NULL` et est
  filtrée par `cabinet_id` dans **chaque** requête applicative.
- ⚠️ Le `db` applicatif tourne en **service role et contourne la RLS** : la sécurité du
  chemin app repose sur le filtre `cabinet_id` discipliné + le trigger
  `fn_check_client_cabinet`, **pas** sur la RLS (cf. addendum ADR 0005).
- Couverture en CI : le test générique
  [`cross-tenant-leak/generic-leak.test.ts`](../../tests/integration/cross-tenant-leak/generic-leak.test.ts)
  rejoue le contrat de sécurité réel sur le chemin app ; les tests
  `multi-tenant-isolation/*` valident la RLS Postgres (défense en profondeur), dont
  [`client-isolation.test.ts`](../../tests/integration/multi-tenant-isolation/client-isolation.test.ts)
  pour `crm.client`.

## Script de démo (manuel, navigateur)

> Vérification de bout en bout en environnement local. Nécessite une session
> authentifiée — non automatisable avant le Sprint 3.6 (`createTestUser()`).

1. Se connecter avec un compte responsable d'un cabinet onboardé.
2. **Créer un client** : `/app/clients` → « Acme Sàrl », statut `actif`. Vérifier qu'il
   apparaît dans la liste.
3. **Uploader un document** : `/app/documents` → déposer `facture_swisscom_2026-04.pdf`.
   Vérifier que la ligne apparaît au statut « À valider ».
4. **Valider** : suivre la bannière « 1 document à valider » → `/app/documents/validation`.
   Le menu client propose « Acme Sàrl ». Vérifier le type/catégorie proposés par le stub,
   attribuer le client, valider.
5. **Vérifier l'issue** : la proposition disparaît de la file ; sur `/app/documents` le
   document est « Validé ». Côté DB : une ligne `doc.document` (statut `valide_humain`),
   la proposition `valide`, l'`upload_brut` `valide`, et une `extraction.invocation`
   (`model_used = 'stub'`).

### Cas d'erreur à observer

| Cas | Comportement attendu |
|---|---|
| Validation sans client sélectionné | Erreur Zod « Sélectionnez un client », pas de `document` créé |
| Même fichier ré-uploadé | Upload marqué `doublon`, pas de second `fichier_physique` |
| Rôle `lecteur` | Upload et validation refusés (403 / message d'erreur) |
| Fichier non reconnu par le stub | Proposition `a_classer` / `autre` avec anomalie, validable manuellement |
| Classification en échec | Fichier conservé au statut `recu`, reclassable |

## État de vérification (fin Phase 3.5)

- ✅ Lint Biome, `tsc --noEmit` (8 packages), `vitest run` (118 tests), `next build`.
- ✅ Chaîne de données cohérente au niveau code : `client_id NOT NULL` désormais
  satisfiable (mini-CRM livré), trigger de cohérence client/cabinet en place.
- ⚠️ **Démo navigateur non exécutée automatiquement** : le parcours requiert une session
  authentifiée. Les tests de server actions authentifiées arrivent au Sprint 3.6.

## Écarts avec la cible (`flow-a-document-entrant.md`)

Différé Phase 4+ — **non implémenté** aujourd'hui :

- **Ingestion** : email Microsoft Graph, scan NAS, upload dashboard client (seul l'upload
  manuel cabinet existe).
- **OCR** : Mistral OCR (le stub ne lit pas le contenu, seulement le nom de fichier).
- **Classification réelle** : Bedrock / Claude Haiku (Phase 4.0, bloquée crédits AWS).
- **Auto-classement** : politiques `strict/hybride/aggressive` — tout passe en validation
  humaine au MVP.
- **Effets de bord** : CRM (`evenement`, `risque`), Calendar (échéances), Facture, Salaire,
  Search (chunking/embeddings), notifications/digest.
- **Cas particuliers** : multi-PJ, email forwardé, multilingue, document personnel.

## Dépendances code

- Module Doc ([`doc.md`](../modules/doc.md))
- Module Extraction IA ([`extraction-ia.md`](../modules/extraction-ia.md)) — `StubClassifier`
- Mini-CRM `crm.client` ([`crm-schema`](../data-model/crm-schema.md))
- Multi-tenant ([`multi-tenant.md`](../architecture/multi-tenant.md)), ADR 0005 (+ addendum)
- Pattern proposition → validation : ADR 0007
