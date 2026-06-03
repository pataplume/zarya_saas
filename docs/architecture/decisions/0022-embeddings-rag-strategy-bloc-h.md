---
status: accepted
date: 2026-06-03
deciders: [tristan]
referenced_by: [search-schema, extraction-ia, llm-strategy, KICKOFF-BLOCS-B-H]
supersedes_assumption: "KICKOFF/CLAUDE.md — « Bloc H entièrement bloqué tant que embeddings IK non câblé »"
---

# ADR 0022 — Stratégie embeddings & RAG du Bloc H (Search)

## Statut

**Acceptée** — 3 juin 2026. Décision **founder** explicite (« acté »). Débloque le Bloc H (Search/RAG), jusqu'ici
réputé « entièrement bloqué » par le `KICKOFF-BLOCS-B-H.md` et `CLAUDE.md`. Cette hypothèse est
**périmée** : la vérification en direct du catalogue Infomaniak (03/06) montre que le modèle
d'embeddings existe, est déjà configuré, et fonctionne sur des documents fiduciaires réels.

## Contexte

Le Bloc H ajoute la **recherche conversationnelle (RAG)** : poser une question en langage naturel,
retrouver les passages pertinents dans les documents du cabinet, répondre avec citations sourcées.
Il repose sur des **embeddings vectoriels** (H1/H2), une **récupération multi-source** (H3) et une
**génération sourcée anti-injection** (H4/H5).

La règle non-négociable n°6 (`CLAUDE.md`) impose que **toute la couche IA passe par Infomaniak AI
Services** (souveraineté CH, ADR 0010), **sans `model_id` codé en dur** : les modèles sont résolus
au runtime par **catégorie** (`chat_small`, `chat_large`, `embeddings`).

### Vérification factuelle (03/06/2026)

Appels réels au catalogue + endpoint (token serveur `.env.local`, lecture seule) :

- `IK_MODEL_EMBEDDINGS=bge_multilingual_gemma2` est **déjà renseigné** dans l'environnement.
- `GET /2/ai/{product}/openai/v1/models` expose **3 modèles d'embeddings** :
  `bge_multilingual_gemma2`, `Qwen/Qwen3-Embedding-8B`, `mini_lm_l12_v2`.
- `POST /openai/v1/embeddings` avec `bge_multilingual_gemma2` renvoie un vecteur de **dimension 3584**
  (endpoint live sur le chemin `/2/`, pas l'ancien `/1/` deprecated).

### Mini-benchmark (7 documents fiduciaires réels, 6 questions)

Pipeline : extraction texte (5 PDF natifs + 2 PDF-image OCRisés) → 29 chunks → embeddings
`bge_multilingual_gemma2` → similarité cosinus → top-3.

- **Sans préfixe d'instruction sur la requête : 2/6** corrects (un long contrat saturait le classement).
- **Avec préfixe d'instruction BGE sur la requête (`<instruct>…<query>`) : 6/6 top-1**, y compris sur
  des documents OCRisés bruités et un mélange FR / termes DE-BE.

## Décision

### 1. Modèle d'embeddings : `bge_multilingual_gemma2` (catégorie `embeddings`)
Retenu pour le MVP du Bloc H. Multilingue (FR/DE/IT/EN — adapté au contexte fiduciaire suisse),
fenêtre 8192 tokens, qualité RAG validée empiriquement (6/6). **Jamais codé en dur** : résolu par la
catégorie `embeddings` via le mapping runtime (`IK_MODEL_EMBEDDINGS`), conformément à la règle 6.

### 2. Dimension du vecteur : `vector(3584)`
`search.document_chunk.embedding` est typé **`vector(3584)`**, index **HNSW** (pgvector). Cette
dimension est **figée par le modèle** : un changement de modèle d'embeddings à dimension différente
impose une **migration destructive de l'index** et une **ré-indexation complète** (cf. Conséquences).

### 3. Préfixe d'instruction sur la requête — OBLIGATOIRE
Les requêtes (et **seulement** les requêtes, pas les passages indexés) sont préfixées par
l'instruction BGE :
`<instruct>Given a question, retrieve passages from accounting/HR documents that answer it\n<query>`.
Sans ce préfixe, la qualité de récupération s'effondre (2/6 → near-useless). Le pipeline de requête
(H3) applique ce préfixe **systématiquement**, en dur ; ce n'est pas une option de réglage.

### 4. Chunking
Découpage ~**512 tokens, overlap ~64** (largement sous la fenêtre 8192). Paramètres ajustables au
pipeline H2 sans changer le schéma. Stockage du `text` du chunk + `text_tsvector` (full-text).

### 5. Récupération hybride (H3)
pgvector (top-K cosinus, HNSW) **+** full-text (`tsvector`/`pg_trgm`) **fusionnés par RRF**
(Reciprocal Rank Fusion), conformément au KICKOFF H3. Le text-to-SQL sécurisé (whitelist,
`cabinet_id` obligatoire, SELECT-only, timeout) reste une brique distincte de H3.

### 6. Multi-tenant (H5)
`search.document_chunk` porte `cabinet_id NOT NULL` + RLS. **Vérification applicative redondante**
du `cabinet_id` de chaque chunk **avant** injection dans le prompt LLM (le `db` service role
contourne la RLS — addendum ADR 0005). Test cross-tenant bloquant CI : « user A pose une question
matchant des docs de B → 0 résultat ».

### 7. Dépendance OCR explicitement actée
L'embedding s'applique à du **texte**. Les documents **image-only** (PDF scannés/photos) n'ont aucun
texte à indexer tant que l'**OCR Infomaniak `vision`** (catégorie `vision`, **différé**) n'est pas
câblé. Le mini-benchmark l'a confirmé : 2 des 6 réponses vivaient dans des PDF-image (OCRisés en
local *pour le test seulement*). **Le vrai prérequis bloquant de la couverture complète de H n'est
donc pas l'embedding, mais l'OCR vision.** H peut démarrer et couvrir tous les documents à texte
natif ; la couverture des scans reste partielle jusqu'au déblocage de `vision`.

#### Séquencement OCR vision (délégué au jugement technique, founder « quand c'est le plus pertinent »)
Recommandation : câbler l'**OCR `vision` Infomaniak comme un bloc dédié placé entre H1 et H2** —
c'est-à-dire **après** avoir figé le schéma `search.*` (H1, qui ne dépend pas de l'OCR) mais
**avant** d'activer le pipeline d'indexation en production (H2). Justification :
- indexer seulement les documents à texte natif donnerait une **fausse complétude** (« la recherche
  marche ») alors que les scans resteraient invisibles — même logique anti-stub que C2/Bloc B ;
- l'OCR vision est **transverse** : il bénéficie aussi au Bloc B (Doc : classification de scans) et
  au Bloc E (Facture : extraction de factures scannées), aujourd'hui limités au texte natif. Le
  câbler une fois sert trois modules.
Tant que l'OCR n'est pas câblé, H2 doit **journaliser explicitement** les documents sautés faute de
texte (pas de silence sur la couverture). Décision d'**ouvrir le bloc OCR vision** à acter au plus
tard à l'entrée de H2.

## Alternatives considérées

- **`Qwen/Qwen3-Embedding-8B` (4096)** : qualité potentiellement supérieure mais vecteurs plus lourds
  (stockage/index +14 %), non nécessaire au vu des résultats de `bge_multilingual_gemma2`. Réservé si
  une régression de qualité est constatée sur corpus élargi.
- **`mini_lm_l12_v2` (384)** : rapide et économique, mais qualité multilingue inférieure ;
  candidat pour un éventuel mode « low-cost » futur, pas pour le MVP.
- **Full-text seul (sans vectoriel)** : 100 % souverain et livrable immédiatement, mais recherche
  purement lexicale (rate les reformulations). Écarté comme cible ; conservé comme **moitié** de la
  récupération hybride (§5) et fallback de dégradation.

## Conséquences

- **Engagement sur `vector(3584)`** : changer de modèle/dimension = migration destructive + ré-index.
  On s'y engage sciemment sur la base du benchmark.
- **Le préfixe d'instruction requête est un invariant** du pipeline H3 (à tester : son absence doit
  être détectable en revue / test de non-régression de qualité).
- **OCR vision = prochaine dépendance à arbitrer** pour la couverture des scans (ré-ouvrir la
  décision « OCR vision différé » avant H2 si la couverture scans est jugée P0).
- **Coût** : embeddings gratuits jusqu'au 30/06/2026 (crédits IK, cf. mémoire interne) ; au-delà,
  facturation à l'usage tracée dans `extraction.invocation` (règle 2 de `packages/extraction`).
- **Séquence H** inchangée (H1 schéma + index → H2 indexation → H3 récupération → H4 réponse sourcée
  → H5 sécurité), mais **débloquée** : H1 peut figer `search.document_chunk` en `vector(3584)`.

## Addendum 2026-06-03 — type `halfvec(3584)` pour la colonne indexée (H1)

À l'implémentation de H1 (migration 0041), contrainte technique pgvector confirmée : l'index
**HNSW du type `vector` est plafonné à 2000 dimensions**. L'embedding faisant 3584 dim, la colonne
`search.document_chunk.embedding` est typée **`halfvec(3584)`** (demi-précision FP16), dont l'index
HNSW (`halfvec_cosine_ops`) supporte jusqu'à 4000 dim (pgvector ≥ 0.7 ; base ZARYA en 0.8.0).
Conséquences : perte de rappel négligeable pour la récupération, **stockage divisé par 2**, opérateur
de distance cosinus `<=>` inchangé. La décision §2 (« vector(3584) ») se lit donc **`halfvec(3584)`**
pour la colonne stockée et indexée. Décision **founder** (AskUserQuestion, 2026-06-03).

## Références

- `CLAUDE.md` règle 6 (souveraineté IK) · ADR 0010 (couche IA Infomaniak)
- `KICKOFF-BLOCS-B-H.md` § Bloc H (H1→H5) · `packages/extraction/CLAUDE.md` (catégories, traçabilité)
- Addendum ADR 0005 (le `db` service role contourne la RLS → vérif applicative redondante)
- Mémoire interne : `infomaniak-embeddings-disponibles`, `infomaniak-credits-vs-ratelimit`
- Benchmark du 03/06/2026 (7 docs fiduciaires réels, 6 questions, 6/6 top-1 avec préfixe d'instruction)
