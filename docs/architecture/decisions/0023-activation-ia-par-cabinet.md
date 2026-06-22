---
status: accepted
date: 2026-06-04
deciders: [tristan]
referenced_by: [llm-strategy, extraction-ia]
---

# ADR 0023 — Activation de l'IA par cabinet + suivi des coûts (bascule EXTRACTION_MODE vers la bêta)

> **Amendement 2026-06-22 — défaut inversé : opt-out (`DEFAULT true`).** Le défaut initial
> `extraction_ia_active = false` (opt-in) provoquait un mode **stub silencieux** sur tout nouveau
> cabinet : classification sans LLM + OCR sauté (même le texte natif gratuit) → « le module ne
> reconnaît plus les factures » (incident Farah Clinic). Pour la bêta, **tous** les cabinets ont
> besoin de l'IA → le défaut passe à `true` (migration 0052). Le **kill-switch global reste
> `EXTRACTION_MODE=live`** (le flag par cabinet n'a d'effet que si l'env est live) et chaque cabinet
> reste **désactivable** via `/parametres/ia`. La maîtrise des coûts repose désormais sur le
> kill-switch global + la désactivation ciblée, pas sur l'opt-in par défaut.

## Contexte

La couche IA (classification Doc, extraction facture/employés, embeddings/recherche) est
pilotée par un unique flag d'environnement **`EXTRACTION_MODE`** lu par
`resolveExtractionMode()` (`packages/extraction/src/classifier.ts`) : `live` branche les
clients Infomaniak, **`stub` est le défaut en prod** (aucun appel IA réel). Constats à la
veille de la bêta :

1. **Tout-ou-rien.** Le flag est **global** : passer `live` activerait l'IA pour **tous** les
   cabinets d'un coup. Pour une bêta de 3-5 cabinets pilotes, on veut activer l'IA **seulement
   pour eux**, les autres restant en stub.
2. **Aucun garde-fou de coût.** Le coût est **tracé** par invocation (`extraction.invocation.cost_usd`,
   `tokens_input/output`, indexé par cabinet) mais **jamais agrégé ni plafonné**. Le champ
   `cabinet.quota_llm_restant` évoqué dans `packages/extraction/CLAUDE.md` **n'existe pas** au schéma.
3. **Crédits Infomaniak.** 1M crédits gratuits jusqu'au **30/06/2026** (cf. mémoire IK) : le risque
   de coût réel est **borné à court terme**, mais devient réel après cette date.
4. **Kill-switch.** Le seul levier d'arrêt aujourd'hui est l'env global (`EXTRACTION_MODE=stub`).

## Décision

1. **Activation par cabinet.** Ajout d'un flag `crm.cabinet.extraction_ia_active boolean NOT NULL
   DEFAULT false` (colonne **additive** ; Bloc A scellé, additif autorisé cf. ADR 0019). L'IA
   d'un cabinet n'est `live` que si **les deux** conditions sont vraies :
   - le **kill-switch global** l'autorise (`EXTRACTION_MODE=live`) — il reste le **maître** :
     `EXTRACTION_MODE=stub` force **tout le monde** en stub, quel que soit le flag cabinet ;
   - le **flag cabinet** `extraction_ia_active = true`.

   `resolveExtractionMode()` (global, inchangé) est complété par une résolution **cabinet-aware**
   `resolveExtractionModeForCabinet(cabinet_id)` : `live` ssi (env live) ∧ (flag cabinet on). Tous
   les chemins IA (classification, extraction facture, indexation embeddings, OCR live) passent à
   cette résolution scopée. Câblage = livrable IA-b (ce PR IA-a pose schéma + ADR).

2. **Suivi des coûts (visibilité, sans blocage).** Vue `extraction.v_cout_par_cabinet` agrégeant
   `extraction.invocation` par cabinet (somme `cost_usd`, `tokens_input/output`, nb invocations,
   dernière invocation). Sert au monitoring opérationnel et à la future facturation à l'usage.

3. **Pas de plafond bloquant au MVP.** Aucune coupure automatique sur dépassement de coût tant que
   les crédits IK sont gratuits (jusqu'au 30/06/2026). Le plafond bloquant par cabinet
   (`quota_llm`) est **différé** et **à ré-arbitrer avant l'expiration des crédits** (condition de
   révision ci-dessous).

4. **Fallback inchangé.** stub → proposition en validation humaine complète ; échec live → retry
   (ADR 0010) puis fallback manuel. Aucune régression du chemin nominal.

## Conséquences

### Positives
- Bêta **ciblée et réversible sans redéploiement** : on active/désactive l'IA cabinet par cabinet
  via le flag DB ; le pilote voit le produit fonctionner, les autres restent inertes.
- Double sécurité : kill-switch global **et** flag par cabinet.
- Visibilité coût immédiate (vue par cabinet) avant toute facturation à l'usage.

### Négatives (assumées)
- `resolveExtractionMode` devient **cabinet-aware** là où il était global → un appel DB (lecture du
  flag) sur le chemin d'activation. Mitigé : les chemins IA portent déjà `cabinet_id` et sont async.
- **Pas de protection dure contre un dérapage de coût** tant que le plafond n'est pas câblé →
  surveiller la vue + ré-arbitrer avant le 30/06/2026.

## Alternatives écartées
- **Flip global simple (`EXTRACTION_MODE=live` pour tous)** : rejeté pour la bêta — active l'IA sur
  tous les cabinets simultanément, sans granularité ni filet pilote.
- **Plafond de coût bloquant par cabinet dès le MVP** : reporté — enforcement à câbler sur chaque
  chemin IA, inutile tant que les crédits sont gratuits ; on pose d'abord la visibilité.

## Conditions de révision
- **Avant le 30/06/2026** (expiration des crédits IK gratuits) → ré-arbitrer le **plafond de coût
  bloquant** par cabinet (champ + enforcement + fallback manuel).
- Passage à la facturation à l'usage → la vue `v_cout_par_cabinet` devient la source d'agrégation.

## Références
- `packages/extraction/src/classifier.ts` (`resolveExtractionMode`), `docs/architecture/llm-strategy.md`
- ADR 0010 (couche IA Infomaniak), ADR 0019 (additif sur Bloc A scellé)
- `extraction.invocation` (traçabilité coût/tokens, migration Bloc 0)
- Mémoire : crédits IK gratuits jusqu'au 30/06/2026
