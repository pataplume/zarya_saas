---
status: archived
owner: founder
last_updated: 2026-05-30
type: handoff
context: response to retro-sessions-claude.md (Phase 3 addendum, 28 mai 2026)
priority: critical
supersedes: HANDOFF.md (27 mai 2026)
sequencing_superseded_by: ADR 0012 (séquence canonique v1.0, 30 mai 2026)
llm_layer_superseded_by: ADR 0010 (Infomaniak — remplace Bedrock)
---

> ⛔ **ARCHIVE — état figé au 2026-05-30, déplacé ici le 2026-06-15, ne plus utiliser comme source de vérité.**
> La séquence Blocs A→H et le plan de cohérence MVP sont **livrés**. État courant :
> [`PLAN-MVP-BETA.md`](../../PLAN-MVP-BETA.md) + mémoire `v1-etat-courant.md`.

# Handoff Founder → Claude Code v2

> Réponse à ta rétrospective Phase 3 (`retro-sessions-claude.md` mis à jour 28 mai 2026). Ce document **remplace** le HANDOFF.md précédent. Lis-le **en entier** avant ta prochaine session. Contient les décisions stratégiques, les corrections de trajectoire, et les sprints à venir.

> ⚠️ **Lis la § 0 d'abord.** Deux pans de ce document (la « séquence officielle » § 2.3 et la § 6 Bedrock) sont **périmés** depuis le 30 mai 2026. La § 0 dit ce qui fait foi aujourd'hui ; le reste est conservé pour l'historique.

---

## 0. Mise à jour 30 mai 2026 — ce qui fait foi aujourd'hui

> Cette section a été ajoutée après deux décisions structurantes prises depuis la
> rédaction initiale (28 mai). En cas de contradiction avec le reste du document,
> **la § 0 gagne.**

### 0.1 — Couche IA : Bedrock → Infomaniak (ADR 0010)

Le branchement « Bedrock » décrit en § 2.3, § 6 et § 7.2 est **abandonné**. Toute la
couche IA passe désormais par **Infomaniak AI Services** (souveraineté suisse, API
OpenAI-compatible, model_ids résolus au runtime par catégorie). Cf. **ADR 0010**.
Conséquence : les sprints « Phase 4.0 Bedrock » du § 6 sont caducs ; il faut lire
« classification via `InfomaniakClassifier` ».

**État réel au 30 mai** : la classification *live* Infomaniak est **branchée et
validée** sur texte OCR réel (golden set n=56 : type 100 %, catégorie 100 %,
exact-match 96.4 %, hallucination 0 %, sur-confiance 0 %). `EXTRACTION_MODE=stub`
reste le défaut en prod. OCR vision + embeddings/RAG restent différés (modules
Facture/Search pas construits).

### 0.2 — Séquencement : ADR 0012 remplace la « séquence officielle » § 2.3

La liste « Phase 4.1 Calendar / 4.2 Facture / 4.3 Search / 4.4 Salaire » du § 2.3 est
**remplacée** par la séquence canonique de l'**ADR 0012**. Motif : on empilait des
modules sur un CRM incomplet (5 tables sur ~20), avec des « FK fantômes » pointant
vers des tables inexistantes. On pose donc **d'abord la fondation CRM complète**, puis
les modules **verticalement, en ordre de dépendance**, chacun fini avant le suivant.

**Séquence canonique figée (Blocs 0→H)** — détail et prérequis dans l'ADR 0012 :

| Bloc | Périmètre | État |
|----|-----------|------|
| 0 | Gouvernance (ADR 0012 + réconciliation doc) | ✅ fait |
| **A** | **Fondation CRM v1.0** — les ~20 tables `crm.*` (+ RLS, triggers, vues, seeds), reconnexion des FK fantômes | ✅ **SCELLÉ** (A1→A10 + correctif AVS, mergés) |
| **B** | **Doc** fini (classif live texte réel, MAJ `document_attendu`, file de validation) | 🚧 **EN COURS (prochain)** |
| C | **Calendar** fini (génération auto échéances, envoi relances, UI) | à faire (Runs 1-5 livrés) |
| D | **Microsoft Graph** (OAuth + Graph) | à faire |
| E | **Facture** (extraction structurée, QR-bill) | à faire |
| F | **onboarding-client + dashboard-client** | à faire |
| G | **Salaire** | à faire |
| H | **embeddings/pgvector + Search** | à faire |
| I | **Chiffrement au repos** colonnes ultra-sensibles (#17, ADR 0013) | à faire — placé après H (décision founder) |

> 📌 **Découpage exécutable B→H + Phase I** : voir **`KICKOFF-BLOCS-B-H.md`** à la racine.
> C'est désormais la **source de vérité d'exécution** (sous-blocs ancrés sur `docs/`,
> DoD universel, rituel par run, arbitrages ouverts). Le découpage A1→A10 ci-dessous reste
> l'historique de la fondation.

**Découpage du Bloc A (runs A1→A10)** — c'est la liste exhaustive des runs de la
fondation CRM :

- **A1** — enrichir `crm.client` ✅ **livré** (migration 0009, PR #38)
- **A2** — `crm.contact` + `crm.adresse` (le **canton** arrive au niveau client ici) ← **prochain run**
- **A3** — `crm.service` + `crm.param_comptable` (régime TVA)
- **A4** — `crm.document_attendu` + **reconnexion des FK fantômes** Calendar
- **A5** — `crm.relation` + `crm.mandat` + `crm.banque` (IBAN chiffré)
- **A6** — `crm.salaire_config` (schéma seulement)
- **A7** — `crm.risque` (+ trigger recalc) + `crm.evenement` + `crm.note`
- **A8** — `crm.risque` + `crm.evenement` + `crm.note` (migration 0017)
- **A9** — `crm.standard_*` (catalogues globaux) + correctif AVS (89 caisses officielles, migration 0019)
- **A10** — vues `crm.v_*` + trigger `derniere_activite` (migration 0018)

> ✅ **Bloc A scellé.** Les runs des Blocs **B→H** sont désormais **découpés en
> sous-blocs** dans `KICKOFF-BLOCS-B-H.md` (dérivés des `docs/modules/*.md` + flows).
> Note : `recalc_risque` (formule de scoring §23.2) et l'UI fiche client ont été
> **différés** — non spécifiés au niveau fondation, ils arrivent avec leurs modules /
> un ADR dédié. La numérotation A5→A10 réellement livrée diffère légèrement du libellé
> initial (mandat/banque/salaire_config répartis), mais le périmètre est couvert.

### 0.3 — Definition of Done par run (anti-bancal, ADR 0012)

Aucun run n'est « fini » sans : migration + RLS + triggers de cohérence `cabinet_id`
+ **tests d'isolation multi-tenant ET anti-fuite cross-tenant** verts en CI (bloquants)
+ UI quand applicable + tests nominal/erreur + **zéro FK fantôme** + zéro TODO sans
ticket. Runs **forward-only et additifs** ; un numéro n'est jamais réutilisé.

### 0.4 — Phases historiques bouclées depuis le 28 mai

- ✅ Phase 3.6 (tests server action authentifiée) — en prod
- ✅ Phase 4.0 (migration IA → Infomaniak, périmètre classification) — classif live validée
- ✅ Bloc 0 (ADR 0012)
- ✅ **Bloc A (fondation CRM) SCELLÉ** — A1→A10 + correctif AVS, tous mergés (migrations 0009→0019)
- 🚧 **Bloc B (Doc fini)** — prochain. Découpage : `KICKOFF-BLOCS-B-H.md`

---

## 1. Acknowledgment de ta retrospective Phase 3

Ton travail Phase 2b → Phase 3 est validé :

✅ **Setup tests fait** (vitest, CI GitHub Actions, 67 tests verts)
✅ **Tests d'isolation multi-tenant** sur toutes les tables métier
✅ **Module Doc squelette complet** (schéma, RLS, inbox, validation humaine)
✅ **Pattern stub-derrière-contrat** intelligent et documenté
✅ **Premier test d'intégration métier du repo**
✅ **Granularité commits améliorée** (5 commits Phase 3 vs 3 commits Phase 2a pour volume comparable)
✅ **Documentation honnête des divergences** (section 7 de ta rétro)
✅ **5 recommandations claires** avec ROI explicite

**Tes décisions techniques sont saluées** :
- Le pattern `Classifier` + `StubClassifier` + `EXTRACTION_MODE` est exactement la bonne abstraction
- Création de l'entité finale en code applicatif (pas trigger) bien justifiée par `extraction-ia.md § 8`
- Le test "validation conforme" corrigé en seedant le client déjà proposé reflète honnêtement le comportement du stub

**Mais ta rétro révèle 2 problèmes que le founder n'avait pas anticipés** et qui changent la priorité :

🚨 **Problème critique #1** : la RLS multi-tenant n'est PAS le rempart réel des queries app (cf. section 7.4 et 9.4 de ta rétro)

⚠️ **Problème #2** : le pattern stub-derrière-contrat est intelligent mais crée un risque psychologique "Module Doc considéré comme terminé alors que 80% de la valeur (IA) n'est pas branchée"

Ces 2 problèmes deviennent la **priorité absolue** avant toute nouvelle feature.

---

## 2. Décisions stratégiques (non négociables)

### 2.1 — Sécurité multi-tenant : alignement docs ↔ implémentation

**Constat** : ta rétro section 7.4 explique que `getDbForCabinet()` est un stub non utilisé, et que le `db` exporté par `@zarya/db` se connecte en service role et bypasse la RLS. La sécurité multi-tenant repose donc sur :
- Le filtre `eq(table.cabinet_id, cabinet_id)` discipliné dans chaque WHERE
- Le trigger `fn_check_client_cabinet` (cohérence cross-table)
- Les tests d'isolation existants qui valident la RLS, **pas le chemin réel des queries app**

**Problème** : ce qui est en prod diverge de ce que disent `multi-tenant.md` et ADR 0005 (qui prétendent que la RLS est le rempart unique).

**Décision founder** :
- **Court terme (Sprint 3.5)** : option (b) de ta Reco 4 — test générique anti-fuite cross-tenant + filtre `cabinet_id` discipliné + documentation honnête du modèle réel
- **Moyen terme (Sprint 4+)** : option (a) de ta Reco 4 — implémenter vraiment `getDbForCabinet()` avec propagation JWT et `SET LOCAL` pour activer la RLS sur le chemin app
- **Documentation immédiate** : addendum ADR 0005 reflétant l'implémentation réelle

**Justification** :
- Un audit (ISO 27001, due diligence investisseur, cabinet pilote sérieux) verrait immédiatement le gap docs/code
- Un oubli de WHERE = fuite cross-tenant silencieuse, **non détectée par la RLS** (désactivée sur chemin app)
- C'est un risque dormant qui grossit à chaque nouvelle query

### 2.2 — Module Doc : "squelette OK, IA en stub" — pas "terminé"

**Décision founder** :
- Le CLAUDE.md doit explicitement indiquer que le module Doc est **incomplet** tant que Bedrock n'est pas branché
- Aucune communication externe (pitch, démo investisseur, démo cabinet pilote) ne peut prétendre que ZARYA fait de la classification IA tant que le stub est en place
- Le stub est un **outil interne de développement**, pas un livrable produit

**Justification** :
- 80% de la valeur du module Doc, c'est l'IA
- Une démo avec stub donne une fausse confiance ("ça marche !") qui fait perdre du temps en interviews fiduciaires
- Risque de réputation si un cabinet pilote découvre que la "classification IA" est une regex sur nom de fichier

### 2.3 — Drift accepté du plan dev

> ⛔ **PÉRIMÉ depuis le 30 mai 2026.** La « Nouvelle séquence officielle » ci-dessous
> (Phase 4.1 Calendar … 4.4 Salaire) est remplacée par la séquence canonique de
> l'**ADR 0012** (Blocs 0→H). Voir § 0.2. Section conservée pour l'historique.

**Constat** : la séquence réelle a divergé du plan initial.

**Plan initial** (`ZARYA_PLAN_DEV.txt`) :
- Phase 2 : Module Doc complet
- Phase 3 : Onboarding fiduciaire
- Phase 4 : Polish + monitoring
- Phase 5 : Pilote

**Réalité** :
- Phase 2a : Onboarding fiduciaire (à la place de Doc)
- Phase 2b : Hardening (tests + cleanup)
- Phase 3 : Module Doc en stub

**Décision founder** : le drift est **accepté et bénéfique**. L'onboarding était nécessaire pour valider le flow utilisateur avant Doc.

**Nouvelle séquence officielle** :
1. ~~Phase 0 Bootstrap~~ ✅
2. ~~Phase 1 Multi-tenant + Auth~~ ✅
3. ~~Phase 2a Onboarding fiduciaire (squelette)~~ ✅
4. ~~Phase 2b Hardening (tests + dashboard)~~ ✅
5. ~~Phase 3 Module Doc (stub IA)~~ ✅
6. ~~Phase 3.5 Sécurité cross-tenant + Mini-CRM~~ ✅
7. **Phase 3.6 Tests server action authentifiée** ← **PROCHAINE PHASE**
8. Phase 4.0 Branchement Bedrock (dès crédits débloqués)
9. Phase 4.1 Module Calendar (échéances fiscales)
10. Phase 4.2 Module Facture (extraction)
11. Phase 4.3 Module Search (RAG)
12. Phase 4.4 Module Salaire
13. Phase 5 Polish + monitoring
14. Phase 6 Pilote

### 2.4 — Ordre de priorité des recommandations Phase 3

Tes 5 recommandations sont validées, mais l'ordre est révisé :

| Ta priorité | Ma priorité | Reco | Justification du changement |
|---|---|---|---|
| Reco 1 (mini-CRM) | **P1** | Mini-CRM | Importante mais après sécurité |
| Reco 2 (Bedrock) | **P2** | Bedrock | Dépend AWS, attente externe |
| Reco 3 (tests auth) | **P1** | Tests server action | Couvre wiring auth/Zod |
| Reco 4 (garde-fou) | **P0** | Anti-fuite cross-tenant | **Risque dormant critique** |
| Reco 5 (CLAUDE.md) | **P0** | Update CLAUDE.md | **5 min, évite confusion** |

**Les 2 P0 sont bloquants avant toute nouvelle feature.**

---

## 3. Phase 3.5 — Sécurité cross-tenant + Mini-CRM ✅ TERMINÉE (2026-05-28)

> Phase clôturée : les 4 sprints (3.5.1 → 3.5.4) sont livrés et mergés sur `develop`.
> Phase courante désormais : **Phase 3.6** (§ 5). Section conservée pour l'historique.

### 3.1 — Modules autorisés

- `tests/integration/` (création test générique anti-fuite)
- `packages/db/` (mise à jour migrations / RLS si besoin)
- `apps/web/app/(app)/clients/` (création CRUD mini-CRM)
- `packages/schemas/` (schémas Zod client)
- `docs/architecture/decisions/0005-multi-tenant-natif-mvp.md` (addendum)
- `docs/architecture/multi-tenant.md` (mise à jour implémentation réelle)
- `CLAUDE.md` racine (section "Phase actuelle" + section "Modules en cours")
- `packages/auth/` UNIQUEMENT si tu décides d'implémenter `getDbForCabinet()` réel (option Sprint 3.6)

### 3.2 — Modules INTERDITS

- `packages/integrations/bedrock` (Phase 4.0, attend AWS)
- `packages/integrations/microsoft` (Phase 4+)
- `packages/integrations/mistral` (Phase 4+)
- `packages/integrations/bexio` (Phase 4+)
- Tous les modules métier non démarrés (Calendar, Facture, Search, Salaire)
- Extension du module CRM au-delà du strict minimum (cf. Sprint 3.6 scope)
- Refactor majeur non demandé
- Toute modification du `StubClassifier` (il fait son job)

---

## 4. Plan d'action Phase 3.5 (3-5 sessions)

### Sprint 3.5.1 — Update CLAUDE.md + ADR 0005 (1 session, 30 min)

**Objectif** : aligner la documentation sur la réalité avant tout nouveau code.

**Tâches** :

1. **Update CLAUDE.md racine — section "Phase actuelle"**

   Remplacer la section actuelle par :
   ```markdown
   ## Phase actuelle du projet
   
   **Phase courante** : Phase 3.5 — Sécurité cross-tenant + Mini-CRM
   
   **État des modules** :
   - ✅ Bootstrap (Phase 0)
   - ✅ Multi-tenant + Auth (Phase 1)
   - ✅ Onboarding fiduciaire squelette (Phase 2a)
   - ✅ Hardening tests + dashboard (Phase 2b)
   - ⚠️ **Module Doc : squelette OK, IA en STUB, en attente crédits Bedrock**
   - 🚧 Sécurité cross-tenant + Mini-CRM (Phase 3.5 en cours)
   
   **Modules autorisés** :
   - tests/integration/ (test générique anti-fuite)
   - apps/web/app/(app)/clients/ (mini-CRM)
   - packages/db/ (si migration nécessaire)
   - packages/schemas/ (schémas Zod client)
   - docs/architecture/ (mise à jour)
   
   **Modules INTERDITS** :
   - packages/integrations/bedrock (attend AWS)
   - packages/integrations/microsoft, mistral, bexio (Phase 4+)
   - Modules métier non démarrés : Calendar, Facture, Search, Salaire
   - Extension CRM au-delà de crm.client minimal
   
   **⚠️ Risques connus** :
   - Le `db` applicatif bypasse la RLS (sécurité = filtre cabinet_id discipliné + trigger)
   - getDbForCabinet() est un stub, propagation JWT non implémentée
   - Le module Doc en stub ne peut pas être présenté comme "IA fonctionnelle"
   ```

2. **Addendum ADR 0005** (`/docs/architecture/decisions/0005-multi-tenant-natif-mvp.md`)

   Ajouter à la fin du fichier :
   ```markdown
   ---
   
   ## Addendum 28 mai 2026 — Implémentation réelle
   
   La décision initiale prévoyait la RLS Postgres comme rempart unique 
   d'isolation multi-tenant via `current_cabinet_id()` lu du JWT.
   
   ### Implémentation Phase 1 → 3
   
   Le `db` exporté par `@zarya/db` se connecte en service role 
   (postgres-js) et **contourne la RLS** sur le chemin applicatif.
   
   La sécurité multi-tenant repose donc actuellement sur :
   
   1. **Filtre `cabinet_id` discipliné** dans toutes les queries app 
      (`eq(table.cabinet_id, currentCabinetId)`)
   2. **Trigger `fn_check_client_cabinet`** pour cohérence cross-table
   3. **Test générique anti-fuite cross-tenant** (Phase 3.5, bloquant CI)
   
   `getDbForCabinet()` existe en stub mais n'est pas utilisé. La 
   propagation JWT + `SET LOCAL app.current_cabinet_id` pour activer 
   la RLS sur le chemin app est différée à Phase 4+.
   
   ### Tests d'isolation actuels
   
   Les tests d'isolation Phase 2b valident la RLS Postgres directement 
   (en se connectant comme un user du cabinet A et tentant de lire les 
   données du cabinet B). Ils sont valides mais **ne reflètent pas le 
   chemin applicatif réel** (qui passe par service role).
   
   Le test générique anti-fuite (Phase 3.5) couvre cette lacune en 
   testant le chemin app : pour chaque table métier, tente une lecture 
   sans filtre `cabinet_id` et vérifie qu'aucune fuite n'est possible.
   
   ### Conséquences pour les futurs développeurs
   
   - **Toute query app DOIT inclure `WHERE cabinet_id = X`** explicitement
   - **Toute nouvelle table métier DOIT avoir son test générique anti-fuite**
   - **La RLS reste activée en DB** comme défense en profondeur, mais n'est 
     pas le rempart principal du chemin app
   
   ### Objectif moyen terme
   
   Implémenter le vrai `getDbForCabinet()` avec :
   - Récupération du JWT côté serveur
   - `SET LOCAL app.current_cabinet_id = <uuid>` au début de chaque transaction
   - RLS effectivement appliquée sur le chemin app
   - Suppression du service role par défaut (sauf cas bootstrap explicites)
   
   Cf. Sprint 4+ (à planifier).
   ```

3. **Update `/docs/architecture/multi-tenant.md`** : section "Implémentation actuelle" qui pointe vers l'addendum ADR 0005.

**Definition of Done** :
- `CLAUDE.md` racine reflète Phase 3.5 et les risques connus
- ADR 0005 addendum ajouté (lisible par un nouveau dev)
- `multi-tenant.md` pointe vers l'addendum
- Commit propre : `docs: align security model with reality (Phase 3.5)`

**Scope strict** : uniquement de la documentation. **Aucun code à toucher dans ce sprint.**

---

### Sprint 3.5.2 — Test générique anti-fuite cross-tenant (1 session, 2-3h)

**Objectif** : créer le filet de sécurité automatique qui détecte tout oubli de WHERE `cabinet_id`.

**Tâches** :

1. **Créer `tests/integration/cross-tenant-leak/generic-leak.test.ts`**

   Le test doit :
   - Setup : créer 2 cabinets (A et B) avec un user par cabinet
   - Pour chaque table métier listée, faire un INSERT dans cabinet B
   - Tenter une SELECT depuis le contexte cabinet A (via le `db` applicatif standard, **pas** via getDbForCabinet)
   - Vérifier que la query retourne 0 ligne (= filtre `cabinet_id` correctement appliqué)
   - Tester aussi : UPDATE et DELETE depuis cabinet A sur données cabinet B doivent échouer ou ne rien affecter

   **Tables à couvrir** :
   ```
   crm.cabinet (lui-même)
   crm.cabinet_membre
   crm.client (créée Sprint 3.5.3)
   crm.zefix_recherche_cabinet
   session_onboarding_fiduciaire
   invitation_membre
   doc.upload_brut
   doc.fichier_physique
   doc.proposition_classement
   doc.document
   extraction.invocation
   ```

2. **Pattern de test à utiliser** :
   ```typescript
   describe('Cross-tenant leak prevention - applicative path', () => {
     for (const table of METIER_TABLES) {
       describe(table.name, () => {
         test(`SELECT from cabinet A cannot see cabinet B ${table.name}`, async () => {
           // ARRANGE : create row in cabinet B
           const rowB = await insertViaServiceRole(table.name, { cabinet_id: cabinetB.id, ...table.fixture });
           
           // ACT : query as if logged in cabinet A
           const queryAsA = db.select().from(schema[table.name]).where(eq(schema[table.name].cabinet_id, cabinetA.id));
           
           // ASSERT : no leak
           const results = await queryAsA;
           expect(results.find(r => r.id === rowB.id)).toBeUndefined();
         });
       });
     }
   });
   ```

3. **Bloquant en CI** : le test doit faire échouer le merge si une fuite est détectée.

4. **Documentation** : ajouter dans `tests/CLAUDE.md` une section "Tests anti-fuite cross-tenant" expliquant le pattern.

**Definition of Done** :
- Test générique couvre les 10 tables métier (11 avec `crm.client` une fois créée en 3.5.3)
- Tous les tests passent en CI
- CI échoue si on simule une fuite (ex : enlever le WHERE dans une query)
- `tests/CLAUDE.md` mis à jour avec le pattern
- Commit propre : `test(security): generic cross-tenant leak prevention`

**Scope strict** : uniquement le test générique. Pas de refactor des queries existantes.

---

### Sprint 3.5.3 — Mini-CRM (`crm.client` CRUD minimal) (1-2 sessions, 3-5h)

**Objectif** : débloquer la démo Doc end-to-end en permettant de créer des clients.

**Scope STRICT** :

**Inclus** :
- CRUD `crm.client` (création, lecture, mise à jour, archive)
- Schéma minimal : `id`, `cabinet_id`, `raison_sociale`, `ide` (optionnel), `langue` (fr|de|it|en), `created_at`, `updated_at`, `archived_at`
- Page `/app/clients` (liste avec filtres simples + archive)
- Page `/app/clients/[id]` (détail + édition inline)
- Page `/app/clients/nouveau` (création avec recherche Zefix optionnelle)
- Sélecteur de client dans la validation Doc (`/app/documents/validation`)
- Test d'isolation cross-tenant sur `crm.client`
- Test E2E simple : créer un client → valider un document avec ce client

**Hors scope** (Phase 4 CRM complet) :
- Contacts (`crm.contact`)
- Dossiers (`crm.dossier`)
- Notes / commentaires sur les clients
- Tags / catégories
- Import en masse (CSV, Excel)
- Historique des modifications détaillé
- Liaison avec d'autres modules (Calendar, Facture)
- Vue "carte client" complète
- Stats / analytics par client

**Pattern d'implémentation** :
- Server Actions pour CRUD (cf. `packages/auth/CLAUDE.md` + `apps/web/CLAUDE.md`)
- Schémas Zod dans `packages/schemas/client.ts`
- Validation côté server + client (React Hook Form + Zod)
- Suivi des UX principes (`/docs/ux-principles.md`) : édition inline, sauvegarde temps réel, pas de bouton Save global
- Réutilisation du `ZefixClient` existant pour pré-remplir à partir de l'IDE
- Audit log dans `audit.action_log` (à créer si pas encore là, sinon utiliser l'existant)

**Definition of Done** :
- Un user peut créer un client (raison sociale + IDE optionnel)
- Un user peut lister ses clients (scopé cabinet)
- Un user peut archiver/désarchiver un client
- Le sélecteur de client fonctionne dans la validation Doc
- Test d'isolation `crm.client` passe (intégré au test générique anti-fuite Sprint 3.5.2)
- Test E2E "création client → validation doc avec ce client" passe
- Pas de scope creep (pas de contacts, pas de dossiers, etc.)
- Commit propre par étape (DB schema, CRUD, UI, sélecteur, tests)

**Référence** :
- `/docs/modules/crm.md` (lire les sections sur `crm.client` uniquement, ignorer le reste)
- `/docs/data-model/crm-schema.md` (section `crm.client`)
- `/docs/ux-principles.md` (UX patterns)

---

### Sprint 3.5.4 — Vérification finale + démo end-to-end (1 session, 1h) ✅

**Objectif** : valider que tout le flux Phase 3 est démontrable bout-en-bout (avec stub IA).

**Tâches** :

1. **Démo end-to-end manuelle** :
   - Signup → onboarding → dashboard
   - Créer 1 client via mini-CRM
   - Upload d'un PDF de test (fixture)
   - Validation du document avec attribution au client créé
   - Vérifier que le document apparaît bien rattaché au client
   - Logout / re-login → tout est persistant

2. **Update CLAUDE.md** :
   - Marquer Phase 3.5 comme terminée
   - Préparer la section "Phase actuelle" pour Sprint 3.6 (tests auth)

3. **Documenter le flux dans `docs/flows/flow-doc-validation.md`** (nouveau fichier ou update existant) :
   - Diagramme simple du flux (Mermaid)
   - Cas d'usage typique
   - Limitations connues (stub IA)

**Definition of Done** :
- Flux complet démontrable manuellement
- Aucun bug bloquant
- CLAUDE.md à jour
- Doc flow à jour
- Repo prêt pour Sprint 3.6

---

## 5. Phase 3.6 — Tests server action authentifiée (1 session, 2-3h)

**Objectif** : couvrir le wiring auth/Zod/RBAC des server actions, actuellement en angle mort.

**Référence rétro** : ta Reco 3 et la leçon § 2.7 ("ne jamais créer des users Supabase en SQL brut").

**Tâches** :

1. **Helper `createTestUser()`** dans `tests/helpers/`
   - Utilise `supabase.auth.admin.createUser()` via service role
   - Retourne user + token JWT utilisable dans les tests
   - Crée aussi le cabinet membre associé
   - Cleanup automatique en `afterEach`

2. **Test E2E `validerPropositionAction` authentifié**
   - Setup : user authentifié dans cabinet A + proposition en `a_valider`
   - Action : appeler `validerPropositionAction` avec input réaliste
   - Vérification : statut `valide_humain`, document créé, audit log écrit
   - Cas d'erreur : user du cabinet B ne peut pas valider proposition cabinet A (RBAC + isolation)

3. **Test équivalent pour `rejeterPropositionAction`**

4. **Test des cas d'erreur Zod**
   - Input malformé → erreur de validation propre
   - Pas de crash, pas de fuite d'info

**Definition of Done** :
- Helper `createTestUser()` réutilisable
- 4-6 tests authentifiés sur les server actions Doc
- CI bloque les merges si tests échouent
- Documentation du pattern dans `tests/CLAUDE.md`

**Modules autorisés pendant ce sprint** :
- `tests/helpers/`
- `tests/integration/server-actions/`
- `tests/CLAUDE.md` (update)

---

## 6. Phase 4.0 — Branchement Bedrock (dépend AWS)

> ⛔ **PÉRIMÉ depuis le 30 mai 2026.** Bedrock est abandonné au profit d'**Infomaniak**
> (ADR 0010). La classification *live* est déjà branchée et validée via
> `InfomaniakClassifier`. Voir § 0.1. Section conservée pour l'historique (le
> raisonnement « stub-derrière-contrat » reste valable, seul le provider change).

**Trigger** : notification AWS confirmant quotas Bedrock débloqués.

**Validation préalable obligatoire** :

```bash
aws bedrock-runtime invoke-model \
  --region eu-central-1 \
  --profile zarya \
  --model-id eu.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":50,"messages":[{"role":"user","content":"Test"}]}' \
  --cli-binary-format raw-in-base64-out \
  /tmp/bedrock-test.json
```

Doit retourner une réponse JSON Claude. Si erreur "Too many tokens per day" persiste : **NE PAS démarrer Phase 4.0**, escalader vers AWS Support.

**Tâches** :

1. **Créer `BedrockClassifier`** implémentant l'interface `Classifier`
   - Wrapper dans `packages/integrations/bedrock/`
   - Utiliser inference profiles UE (`eu.anthropic.claude-haiku-4-5-20251001-v1:0` par défaut, `eu.anthropic.claude-sonnet-4-6` pour cas critiques)
   - Trace dans `extraction.invocation` (réelle cette fois : tokens, coût, latency)
   - Gestion d'erreurs typées (ThrottlingException, ValidationException, etc.)

2. **Fixtures PDF suisses synthétiques** (5-10 documents)
   - QR-facture Swiss QR-bill
   - Décompte salaire AVS
   - Déclaration TVA (formulaire 0xxx)
   - Contrat de travail
   - Attestation employeur AVS
   - **Tous synthétiques, données inventées mais structure réaliste**

3. **Bascule `EXTRACTION_MODE=live`** dans `.env.local` et Vercel preview
   - Test sur les fixtures
   - Mesurer précision par catégorie
   - Documenter les résultats observés

4. **ADR 0010 — Inference profiles UE et model IDs réels** (nouveau)
   - Documenter les inference profiles disponibles (`eu.anthropic.*`)
   - Justifier le choix Haiku par défaut, Sonnet pour cas critiques, Opus pour les exceptions
   - Stratégie de fallback si un modèle est indisponible

**Definition of Done** :
- `BedrockClassifier` fonctionne sur les fixtures
- Précision documentée (>= 80% sur catégories principales)
- ADR 0010 créé
- Switch `EXTRACTION_MODE=live` fonctionnel en preview Vercel
- Tests de non-régression : le stub continue de fonctionner si on revient en `EXTRACTION_MODE=stub`

---

## 7. Décisions ouvertes — réponses du founder

Ta rétro section 10 demande 4 choses au founder. Voici les réponses.

### 7.1 — Décision ordre : mini-CRM avant Phase 4 ?

**Oui, mais APRÈS sécurité cross-tenant.**

Ordre confirmé :
1. Sprint 3.5.1 : Update docs (CLAUDE.md + ADR 0005)
2. Sprint 3.5.2 : Test générique anti-fuite cross-tenant
3. Sprint 3.5.3 : Mini-CRM
4. Sprint 3.5.4 : Vérification end-to-end
5. Sprint 3.6 : Tests server action authentifiée
6. Sprint 4.0 : Bedrock (dépend AWS)

### 7.2 — Statut crédits AWS Bedrock

**État au 28 mai 2026** :
- IAM User `zarya-bedrock-prod` créé ✅
- Credentials générés et stockés (`.env.local`, Vercel, 1Password) ✅
- AWS CLI configuré avec profile `zarya` ✅
- Inference profiles UE validés ✅
- Cohere Embed v4 disponible ✅
- 4 demandes de quotas TPM/RPM ouvertes le 27 mai 2026 (Sonnet 4.6 + Haiku 4.5)
- **Statut quotas : en attente AWS Support** (annonce 24-48h)

**Test invocation actuel** : échoue avec "Too many tokens per day" (quota daily à 0 sur nouveau compte AWS).

**Action de Claude Code** : ne PAS démarrer Phase 4.0 tant que ce test ne retourne pas une réponse JSON Claude valide.

**Action founder** : surveiller email AWS Support, retester périodiquement (1x/jour), tenir Claude Code informé.

### 7.3 — Autorisation de toucher `crm.client` (actuellement Phase 4)

**Oui, accordée pour Sprint 3.5.3, avec SCOPE STRICT.**

Cf. section 4 (Sprint 3.5.3 — Mini-CRM) ci-dessus pour la liste inclus/hors scope.

**Règle** : si tu identifies pendant le sprint un besoin hors scope (ex : "il faudrait aussi gérer les contacts"), tu le notes dans une issue GitHub ou un fichier `TODO.md`, **tu ne le codes PAS dans ce sprint**.

### 7.4 — Fixtures PDF suisses anonymisées

**Pas encore disponibles depuis interviews fiduciaires** (interviews à mener en parallèle Phase 3.5/3.6).

**Solution intermédiaire** : générer 5-10 fixtures synthétiques en Sprint 4.0 (cf. section 6). Contenus inventés mais structure réaliste :
- Utiliser des modèles publics (formulaires AVS, TVA officiels)
- Données factices (noms entreprises, montants, dates)
- Pas de vrai numéro AVS ni IDE réel
- Couvrir les 5-6 catégories principales

**Plan long terme** : pendant Phase 4.1+, demander aux 1-3 premiers cabinets pilotes 5-10 PDFs anonymisés par cabinet pour enrichir le corpus de validation.

---

## 8. Engagements mutuels (mis à jour)

### Founder s'engage à :
- Fournir un brief structuré en début de chaque session (référence à ce HANDOFF v2)
- Valider les ADR nouveaux avant implémentation
- Reviewer les PR rapidement (< 24h)
- Surveiller statut AWS Bedrock et informer Claude Code
- Mener interviews fiduciaires en parallèle pour récolter fixtures et feedback
- Mettre à jour ce HANDOFF à chaque transition de phase
- Ne pas demander de scope creep en cours de session
- Fournir wireframes/maquettes avant Phase 4.1+ (UI métier complexe)

### Claude Code s'engage à :
- Lire ce HANDOFF v2 en début de chaque session pendant Phases 3.5 + 3.6 + 4.0
- Respecter strictement les modules autorisés/interdits
- Plan mode systématique pour toute feature non triviale
- Tests d'isolation pour toute nouvelle table métier
- Tests anti-fuite cross-tenant intégrés au test générique pour toute nouvelle table métier
- Documenter les pièges rencontrés dans les CLAUDE.md des packages concernés
- Refuser de coder hors scope (même si founder semble le demander en cours de session)
- Signaler immédiatement tout drift vs ce HANDOFF
- **Ne jamais présenter le module Doc comme "IA fonctionnelle" tant que stub**
- **Ne jamais bypass le filtre `cabinet_id` dans une query app**

---

## 9. Métriques de succès Phase 3.5 + 3.6

Pour mesurer que ces phases sont terminées :

| Métrique | Cible Phase 3.5 | Cible Phase 3.6 |
|---|---|---|
| Test générique anti-fuite | ≥ 11 tables couvertes | identique |
| `crm.client` CRUD fonctionnel | ✅ | identique |
| Démo end-to-end (sans IA) | ✅ | identique |
| Tests server action authentifiée | 0 | ≥ 6 tests |
| Helper `createTestUser()` | absent | présent |
| Coverage tests | ~50% | ~60% |
| Documentation alignée avec code | ✅ | ✅ |
| ADR 0005 addendum | ✅ | identique |
| ADR 0010 (Bedrock IDs) | non | conditionnel Phase 4.0 |
| CLAUDE.md à jour | ✅ | ✅ |

---

## 10. Communication founder ↔ Claude Code (rappel)

### Quand demander au founder
- Décision structurante non documentée dans un ADR existant
- Conflit entre 2 ADR ou entre doc et implémentation
- Besoin de wireframe / design UX (Phase 4.1+)
- Question business / produit
- Doute sur la sécurité ou la conformité
- Découverte d'un risque non listé dans le HANDOFF
- Statut quotas AWS Bedrock pour démarrer Phase 4.0

### Quand décider seul
- Implémentation technique d'une feature spécifiée
- Choix entre 2 patterns équivalents documentés
- Refactor mineur dans le scope autorisé
- Documentation au fil de l'eau
- Choix de seed data pour les tests
- Optimisation de tests existants

### Format de communication préféré
- Brief court en début de session
- Plan mode systématique avant code
- Commits avec messages conventionnels
- PR petites avec description claire
- Pas de mega-PR de 4000 lignes (Phase 2a était un anti-pattern)

---

## 11. Prochaine action immédiate

**Session #1 de Phase 3.5 — Sprint 3.5.1 (Update docs)**

Brief à copier-coller dans Claude Code :

```
Sprint 3.5.1 — Update docs (CLAUDE.md + ADR 0005).

Référence : HANDOFF_V2.md section 4 (Sprint 3.5.1)

3 tâches uniquement, AUCUN code applicatif à toucher :

1. Update CLAUDE.md racine — section "Phase actuelle"
   Cf. HANDOFF_V2.md § 4.3.5.1 tâche 1 pour le contenu exact

2. Addendum ADR 0005 — implémentation réelle
   Cf. HANDOFF_V2.md § 4.3.5.1 tâche 2 pour le contenu exact

3. Update /docs/architecture/multi-tenant.md
   Ajouter une section "Implémentation actuelle" qui pointe vers
   l'addendum ADR 0005

Definition of Done :
- CLAUDE.md racine reflète Phase 3.5 et risques connus
- ADR 0005 addendum ajouté
- multi-tenant.md pointe vers l'addendum
- Commit : docs: align security model with reality (Phase 3.5)

Scope strict : uniquement documentation. AUCUN code.
Pas de refactor, pas de nouvelle feature, pas de test.

Propose un plan avant d'écrire les fichiers.
```

---

## 12. Annexes — Référence rapide

### A. Fichiers à toucher pendant Phase 3.5

```
docs/
├── architecture/
│   ├── decisions/
│   │   └── 0005-multi-tenant-natif-mvp.md         (addendum)
│   └── multi-tenant.md                            (update)
├── flows/
│   └── flow-doc-validation.md                     (créer en 3.5.4)
└── ...

CLAUDE.md                                          (update phase)

packages/
├── db/
│   ├── schema/
│   │   └── crm.ts                                 (extend pour crm.client)
│   └── migrations/
│       └── XXXX_crm_client.sql                    (nouvelle)
├── schemas/
│   └── client.ts                                  (nouveau, Zod)
└── ...

apps/web/
└── app/
    └── (app)/
        ├── clients/
        │   ├── page.tsx                           (liste)
        │   ├── nouveau/
        │   │   └── page.tsx                       (création)
        │   └── [id]/
        │       └── page.tsx                       (détail/édition)
        └── documents/
            └── validation/
                └── ...                            (ajout sélecteur client)

tests/
├── helpers/
│   └── createTestUser.ts                          (Sprint 3.6)
├── integration/
│   ├── cross-tenant-leak/
│   │   └── generic-leak.test.ts                   (Sprint 3.5.2)
│   └── server-actions/                            (Sprint 3.6)
│       └── doc-validation.test.ts
└── CLAUDE.md                                      (update pattern)
```

### B. Conventions à respecter (rappel)

- **Multi-tenant** : `cabinet_id` partout, filtre explicite dans toutes les queries
- **TypeScript strict** : zéro `any` non justifié, zéro `@ts-ignore`
- **Naming** : `kebab-case` fichiers, `PascalCase` composants/types, `camelCase` variables, `snake_case` DB
- **Commits** : Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`)
- **Branches** : `feat/`, `fix/`, `chore/`, jamais de push direct sur `main` ou `develop`
- **PR** : 1 sprint = 1 PR, granularité fine, description claire

### C. Pièges connus (rappel rétro)

- `'use client'` dans browser.ts → ne pas importer depuis Server Component
- Route `(app)/page.tsx` conflit avec `app/page.tsx` → utiliser `(app)/app/page.tsx`
- Layout authentifié → `export const dynamic = 'force-dynamic'`
- `exactOptionalPropertyTypes` → conditional spread `{...(val !== undefined ? { val } : {})}`
- `process` / `Buffer` → `"@types/node": "*"` dans devDependencies
- `DATABASE_URL` Vercel → format `postgresql://user:pass@db.PROJECT.supabase.co:5432/postgres` (le `@db.` est critique)
- Zefix → POST avec body JSON, pas GET avec query params
- Zefix IDE → normaliser avant query (`CHE-XXX.XXX.XXX` → `CHEXXXXXXXXX`)
- Users Supabase → toujours via `supabase.auth.admin.createUser()`, jamais en SQL brut
- Drizzle `numeric` → expects strings, pas numbers (`.toFixed(2)`)
- `@zarya/*` packages → ajouter alias `resolve` dans `vitest.config.ts`

---

*Document généré le 28 mai 2026 en réponse à la rétrospective Phase 3. Supersede HANDOFF.md du 27 mai. À mettre à jour à chaque transition de phase. Source de vérité pour Phases 3.5, 3.6, 4.0.*
