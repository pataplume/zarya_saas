---
status: accepted
date: 2026-05-30
deciders: [tristan]
referenced_by: [crm-schema, flow-a-document-entrant, dashboard-client]
---

# ADR 0015 — Modèle de scoring du risque client (`crm.risque`)

> ⚠️ **BARÈME PROVISOIRE — À RECALIBRER.** Les poids (25/20/10) et seuils (`ok`/
> `surveillance` à 1, `critique` à 50) du §1 sont une **heuristique MVP non calibrée sur
> données fiduciaires réelles**, acceptée par le founder « OK tant que c'est noté ». Ils ne
> sont **pas** une vérité métier. Le champ `facteurs.version` (`"v1"`) permet de les faire
> évoluer **sans migration ni reshape**. À ré-arbitrer dès qu'on a des données réelles
> et/ou un retour fiduciaire (et au plus tard quand C4 ajoute le facteur `relance`).

## Statut

**Acceptée** — 30 mai 2026 (barème v1 provisoire, cf. avertissement ci-dessus). Cadrage du
sous-bloc **B5** (effets de bord en chaîne).
Tranche le ⚠️ « aucun barème de scoring spécifié » que le **Bloc A a délibérément
différé** (migration `0018_crm_vues_fonctions.sql`, lignes 14-17 : « §23.2
`recalc_risque(client_id)` : AUCUNE formule de scoring spécifiée dans la doc. Inventer un
barème dans une fondation jamais reshapée serait une dette → DIFFÉRÉ à une décision
métier/ADR dédiée »). Cet ADR **est** cette décision dédiée.

## Contexte

`crm.risque` (crm-schema.md §17) existe depuis le Bloc A8 avec ses colonnes
(`score integer 0-100`, `niveau ok|surveillance|critique`, `facteurs jsonb`,
`drapeau_critique`, `drapeau_motif`, `dernier_calcul`), mais **aucune valeur n'y est
jamais écrite** : la vue `crm.v_client_dashboard` lit `r.score` / `r.niveau` qui restent
à `0` / `NULL`. Le dashboard affiche donc un risque mort.

Deux faits de cadrage :

1. **Les inputs du risque sont documentés ; la formule ne l'est pas.** crm-schema.md
   §23.2 nomme les déclencheurs (« après INSERT/UPDATE sur `document_attendu`,
   `echeance`, `relance` → appelle `crm.recalc_risque(client_id)` ») et le dashboard
   matérialise déjà deux signaux exploitables :
   - `nb_documents_manquants` = `crm.document_attendu` `statut_periode_courante IN
     ('manquant','en_retard')` (vue `v_client_dashboard` / `v_documents_manquants`) ;
   - `prochaine_echeance` / échéances `crm.echeance` `statut = 'en_retard'`.
   Le **barème** (poids, seuils) n'est écrit nulle part.

2. **Aucune ligne `crm.risque` n'est provisionnée par client.** Aujourd'hui seuls les
   seeds/tests insèrent une ligne. Un recalcul doit donc **upserter** (créer la ligne si
   absente), pas supposer son existence.

B5 (flow-a §7.A) exige « recalcul `crm.risque.score` du client » à la finalisation d'un
document, et son DoD KICKOFF demande « recalcul risque testé ». Impossible sans trancher
le barème — d'où cet ADR, validé **avant** implémentation (décision founder au kickoff B5).

## Décision

### 1. Barème MVP — minimal, conservateur, additif, plafonné

Le score est une somme pondérée de **signaux déjà matérialisés dans le schéma scellé**
(aucune donnée nouvelle, aucune table nouvelle), bornée à `[0, 100]` :

| Signal (période courante, scopé cabinet + client) | Source | Poids |
|---|---|---|
| Échéance **en retard** | `crm.echeance` `statut='en_retard'`, `archived_at IS NULL` | **25 / unité** |
| Document attendu **en retard** | `crm.document_attendu` `statut_periode_courante='en_retard'`, `actif`, non archivé | **20 / unité** |
| Document attendu **manquant** | `crm.document_attendu` `statut_periode_courante='manquant'`, `actif`, non archivé | **10 / unité** |

```
score = min(100, 25·nb_echeances_en_retard + 20·nb_docs_en_retard + 10·nb_docs_manquants)
```

`niveau` dérivé du score :

| Score | `niveau` |
|---|---|
| `0` | `ok` |
| `1 – 49` | `surveillance` |
| `≥ 50` | `critique` |

- `drapeau_critique = (niveau = 'critique')`.
- `drapeau_motif` : phrase FR résumant les compteurs non nuls (`null` si `ok`).
- `facteurs` (jsonb) trace le détail pour transparence/debug et future UI :
  `{ version: "v1", nb_echeances_en_retard, nb_documents_en_retard, nb_documents_manquants, score, niveau, calcule_le }`.
- `dernier_calcul = now()` à chaque recalcul.

**Lecture du barème** : une seule échéance en retard (25) ou un seul document en retard
(20) → `surveillance` ; deux échéances en retard (50) → `critique`. Conservateur (on
n'escalade pas sur du bruit), interprétable, **révisable** (le champ `facteurs.version`
permet de versionner le barème sans migration).

### 2. Hors-scope MVP (différé, non oublié)

- **Signal `relance` sans réponse** : bien que §23.2 le cite, la sémantique « relance
  sans réponse / escalade » appartient au **tracking réponses de Calendar (Bloc C4)**,
  qui n'existe pas encore et qui **dépend de B5**. L'ajouter maintenant inventerait une
  sémantique non construite. → Facteur ajouté quand C4 atterrit (barème `v2`).
- **Pondération par ancienneté / récurrence manquée**, signaux Facture/Salaire : Phase 2.

### 3. Mécanisme : cœur pur TS + recalcul applicatif (cohérent B3/B4)

Conformément à l'arbitrage B3 (« effets de bord **applicatifs**, pas trigger DB »,
cohérent avec l'exception `doc.document` créé en code) et au style des Blocs B2/B3/B4
(cœur **pur** testable sans DB + câblage applicatif) :

- La formule vit dans une **fonction pure** `computeScoreRisque(signals)` de
  `@zarya/extraction` (unit-testable, sans I/O).
- `finaliserDocument` (chemin **partagé** validation humaine **et** auto-classement)
  compte les signaux (1 requête agrégée scopée `cabinet_id` + `client_id`), calcule via
  le cœur pur, puis **upsert** `crm.risque` (`INSERT … ON CONFLICT (client_id) DO
  UPDATE`). Le `cabinet_id` de la ligne risque vient du `client_id` finalisé (anti-fuite :
  jamais cross-cabinet).
- Un événement `crm.evenement` `score_recalcule` (type déjà présent dans l'enum) est émis
  **uniquement si `niveau` change** (évite le bruit : sinon chaque document émettrait un
  événement). `acteur_type` = celui de la finalisation (`cabinet_membre` ou `ia`).

> **Divergence assumée vs §23.2** : la doc suggérait un **trigger SQL** sur
> `document_attendu`/`echeance`/`relance`. On retient le **recalcul applicatif** côté Doc
> (même raison que B3). Quand Calendar (C4) modifiera échéances/relances, il **réutilisera
> le même cœur pur** `computeScoreRisque` pour recalculer — un seul barème, une seule
> source de vérité TS. Le nom `crm.recalc_risque` côté SQL n'est donc **pas** créé en B5
> (on ne fige pas un point d'entrée DB tant qu'aucun trigger ne l'appelle).

### 4. Provisioning de la ligne `crm.risque`

L'upsert au recalcul **crée** la ligne à la première finalisation. Aucune migration de
provisioning rétroactif n'est nécessaire en MVP (les clients sans document finalisé n'ont
pas de risque calculé → la vue `v_client_dashboard` les montre déjà en `NULL`/`0` via le
`LEFT JOIN`, comportement inchangé et acceptable).

## Conséquences

**Positives**
- Le risque cesse d'être mort : le dashboard affiche un score/niveau réels après la 1ʳᵉ
  finalisation, sans nouvelle table ni donnée nouvelle (100 % signaux scellés du Bloc A).
- Barème **versionné** (`facteurs.version`) → évolutif sans migration ni reshape du Bloc A.
- Cohérent avec le style B2/B3/B4 (cœur pur testable) et l'arbitrage B3 (applicatif).
- Réutilisable par Calendar/C4 (même cœur pur) sans dette de couplage.

**Négatives / limites assumées**
- Barème **heuristique** (poids choisis par défaut, non calibrés sur données réelles
  fiduciaires) — c'est un MVP révisable, pas une vérité métier. Le versionnage limite le
  risque.
- Recalcul **uniquement sur finalisation de document** en B5 (pas sur transition
  d'échéance) ; la couverture « après UPDATE échéance/relance » arrive avec C4. Entre les
  deux, un score peut être légèrement périmé si une échéance bascule `en_retard` sans
  qu'un document soit finalisé — acceptable en MVP (le balayage temporel Calendar le
  rattrapera).

## Alternatives écartées

- **Trigger SQL `crm.recalc_risque`** (littéral §23.2) : rejeté pour B5 — incohérent avec
  l'arbitrage B3 (applicatif), fige un barème en SQL plus dur à tester unitairement, et
  coupler un trigger à chaque UPDATE `document_attendu` est plus lourd que nécessaire.
- **Différer tout le recalcul (B5 = event spine seul)** : possible mais laisse le risque
  mort et le DoD B5 « recalcul risque testé » non rempli ; le founder a choisi de livrer
  le recalcul avec ce barème.
- **Barème riche (relances, ancienneté, pondération Facture/Salaire)** : prématuré, dépend
  de modules non construits (C4/E/G) → Phase 2.

## Références

- `docs/data-model/crm-schema.md` §17 (table `risque`), §23.2 (déclencheurs recalcul).
- `docs/flows/flow-a-document-entrant.md` §7.A (effet de bord recalcul score).
- `packages/db/migrations/0018_crm_vues_fonctions.sql` (déferral explicite du barème).
- ADR 0012 (séquence canonique, Bloc B), ADR 0007 (proposition→validation), ADR 0005
  (multi-tenant : anti-fuite cabinet_id sur le chemin app service-role).
- `KICKOFF-BLOCS-B-H.md` §B/B5.
