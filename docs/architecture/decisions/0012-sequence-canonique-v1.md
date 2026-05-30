---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [roadmap, handoff, crm-schema, calendar]
supersedes_sequencing_in: [roadmap.md §3, HANDOFF_V2.md §2.3, CLAUDE.md "Phase actuelle"]
---

# ADR 0012 — Séquence canonique v1.0 : fondation CRM complète, puis modules en ordre de dépendance

## Statut
Acceptée — 30 mai 2026. Décision de cadrage **programme** (au-dessus des ADR de
module). Fige une séquence de construction unique vers une **v1.0 finale** et
réconcilie les trois sources de vérité divergentes (`roadmap.md`, `HANDOFF_V2.md`,
`CLAUDE.md`). Tranche la question : *dans quel ordre construire pour ne plus empiler
des modules sur des fondations incomplètes ?*

## Contexte

Une revue factuelle du code (pas seulement de la doc) a établi trois faits :

1. **Le CRM est le goulot d'étranglement.** Sur les ~20 tables prévues par
   `docs/data-model/crm-schema.md`, **5 existent** (`cabinet`, `cabinet_membre`,
   `client` **minimal**, `echeance`/`relance` de base) ; **~13 sont absentes** —
   dont les piliers `service`, `contact`, `param_comptable` (régime TVA),
   `document_attendu`, `salaire_config`, `risque`, `evenement`. `crm.client` n'a que
   8 colonnes sur ~22 cibles ; le **canton n'existe pas au niveau client**.

2. **On a déjà commencé à empiler sur du sable.** Le module Calendar
   (`crm.echeance`/`crm.relance`, `calendar.*`, `@zarya/calendar`) référence des
   tables **inexistantes** via des `uuid` sans FK (« FK fantômes ») :
   `echeance.service_id` → `crm.service`, `echeance.documents_requis[]` et
   `relance.document_attendu_id` → `crm.document_attendu`,
   `relance.destinataire_contact_id` → `crm.contact`. C'est la signature exacte d'un
   consommateur bâti avant son producteur.

3. **Les trois sources de vérité se contredisent**, ce qui rend toute planification
   instable :
   - `roadmap.md §3` met **Calendar + Microsoft Graph en Phase 1 MVP (M4-M5)**.
   - `HANDOFF_V2.md §2.3` met **Calendar en Phase 4.1**, et parle encore de
     **Bedrock** (périmé : ADR 0010 a acté Infomaniak).
   - `CLAUDE.md` classe Calendar « non démarré / interdit Phase 4.0 » alors que son
     schéma et sa brique de rendu de relance **existent déjà** en prod.

Trois modules métier (**Calendar, Facture, Salaire**) consomment tous des attributs
CRM qui n'existent pas. Les construire maintenant garantirait une v1.0 bancale.

**Ligne directrice retenue : le schéma CRM est le contrat qu'on ne doit plus jamais
reshaper. On le pose complet une fois, comme fondation testée, puis on construit les
modules verticalement dessus — chacun fini avant le suivant.**

## Décision

### Principe directeur

On distingue deux natures de travail, traitées différemment :

- **Le schéma CRM (le modèle de données de référence)** — *cheap*, *sûr*, et
  *entièrement testable sans aucun producteur externe* (ni Microsoft Graph, ni
  embeddings). On le construit **intégralement maintenant** (les 20 tables), ce qui
  supprime d'un coup la dette de FK fantômes et garantit qu'aucun module n'aura plus
  à déformer le modèle.
- **Les features par module (UI, logique métier, intégrations tierces)** — coûteuses
  et dépendantes de producteurs. Elles suivent la demande, **module par module, en
  ordre de dépendance**, chacune *finie* avant la suivante.

### Séquence canonique (figée)

| Bloc | Périmètre | Prérequis | État |
|----|-----------|-----------|------|
| **0** | Gouvernance : cet ADR + réconciliation `roadmap`/`HANDOFF`/`CLAUDE` | — | en cours |
| **A** | **Fondation CRM v1.0** — les 20 tables `crm.*` (+ RLS, triggers, vues, seeds), reconnexion des FK fantômes | Bloc 0 | à faire |
| **B** | **Doc** fini (producteur racine) : OCR vision validé en prod, classif live sur texte réel, MAJ `document_attendu` | A4 | à faire |
| **C** | **Calendar** fini : génération auto des échéances (Run 6), UI échéances/relances | A3, A4 | à faire |
| **D** | **Microsoft Graph** (producteur transverse) : OAuth + Graph | — | à faire |
| **E** | **Facture** : extraction structurée, QR-bill (ADR dédié à ouvrir) | B, A3, A5, D | à faire |
| **F** | **onboarding-client + dashboard-client** (prérequis invariant de Salaire) | A | à faire |
| **G** | **Salaire** | B, C, F, A6 | à faire |
| **H** | **embeddings/pgvector + Search** (le puits : indexe tout) | tous | à faire |

### Découpage du Bloc A (fondation CRM), ordre `crm-schema.md §25`

A1 enrichir `crm.client` · A2 `contact` + `adresse` (canton client) · A3 `service` +
`param_comptable` (régime TVA) · A4 `document_attendu` + reconnexion FK fantômes ·
A5 `relation` + `mandat` + `banque` (IBAN chiffré) · A6 `salaire_config` (schéma) ·
A7 `risque` (+ trigger recalc) + `evenement` + `note` · A8 `standard_*` + seeds +
`cabinet_integration` + `modele_*` · A9 vues + fonctions · A10 UI fiche client.

### Numérotations retirées

Les phases « Phase 1/2/3 » (roadmap business, horizon mois) et « Phase 4.x » (HANDOFF,
sprints IA) **coexistaient et se contredisaient**. À partir de cet ADR, la séquence
d'**ingénierie** fait foi via les **Blocs 0→H** ci-dessus. La roadmap business reste
valable comme cible *produit/marché* (mois, P0/P1/P2) mais ne dicte plus l'ordre de
construction.

### Definition of Done (anti-bancal, par run)

Aucun run n'est « fini » sans : migration + RLS + triggers de cohérence `cabinet_id`
+ **tests d'isolation multi-tenant ET anti-fuite cross-tenant** verts en CI
(bloquants) + UI quand applicable + tests nominal/erreur + **zéro FK fantôme** + zéro
TODO sans ticket. Runs **forward-only et additifs** ; un numéro n'est jamais réutilisé.

## Conséquences

**Positives**
- Une seule source de vérité de séquencement → fin des plans bâtis sur une carte fausse.
- La dette de FK fantômes est soldée par le Bloc A (le modèle devient intègre).
- Calendar/Facture/Salaire se branchent sur un CRM stable, sans le reshaper.
- La fondation CRM est livrable et testable **sans aucun producteur externe**.

**Négatives / dette assumée**
- Le Bloc A est un investissement amont (~10 runs) avant la prochaine valeur *module*
  visible. Assumé : c'est le prix d'une v1.0 non bancale.
- Certaines tables (`salaire_config`, `banque`, `risque`) sont posées en schéma avant
  que leur UI/logique n'existe (elles arrivent avec leur module). Coût quasi nul,
  bénéfice = intégrité du modèle.

## Alternatives écartées

- **Continuer module par module sans compléter le CRM** — écarté : reproduit la dette
  de FK fantômes et mène à une v1.0 bancale (le problème qu'on corrige).
- **CRM « cœur d'abord » (6-7 tables) puis le reste plus tard** — écarté par le
  décideur : le schéma est *cheap* et c'est le contrat à ne plus reshaper ; le poser
  complet en une fois élimine toute dette résiduelle.
- **Suivre `roadmap.md` (Calendar + Graph en Phase 1)** — écarté : optimiste, ignore
  l'ordre de dépendance réel (aucun code Graph n'existe, CRM incomplet).

## Conditions de révision
- Si un module v1.0 révèle un besoin de schéma CRM non prévu → addendum à cet ADR
  (jamais un patch ad hoc sur une table consommée).
- Si la priorité produit/marché impose d'anticiper un module → on réordonne les Blocs
  **B→H**, jamais le Bloc A (la fondation reste première).

## Actions de réconciliation documentaire (à valider par le founder)

Ces éditions touchent `CLAUDE.md` / `HANDOFF` → **non appliquées sans validation
explicite** :
1. `CLAUDE.md` « Phase actuelle » → pointer vers la séquence Blocs 0→H de cet ADR ;
   corriger le statut de Calendar (« schéma + rendu relance livrés », non « interdit »).
2. `HANDOFF_V2.md §6` → acter Bedrock→Infomaniak (déjà fait dans ADR 0010).
3. `roadmap.md` → noter qu'elle reste la cible *produit* (mois/P0-P2) mais que l'ordre
   de **construction** suit cet ADR.

## Références
- `docs/data-model/crm-schema.md` (schéma CRM cible, §25 plan de migration)
- `docs/modules/{crm,doc,calendar,facture,salaire,search}.md` (en-têtes `depends_on`)
- `docs/roadmap.md` §3 ; `HANDOFF_V2.md` §2.3 (séquences contradictoires réconciliées)
- ADR 0005 (multi-tenant natif + addendum RLS bypass) — DoD isolation/anti-fuite
- ADR 0010 (couche IA Infomaniak — remplace Bedrock)
- ADR 0011 (périmètre MVP Calendar + addendum découpage en runs)
