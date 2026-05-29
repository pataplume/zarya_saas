---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P1
module: search
depends_on: [crm, multi-tenant, doc, extraction-ia, nas-ingestion, llm-strategy]
referenced_by: [doc, dashboard-client]
---

# Zarya Search — Recherche conversationnelle avec sources

## 1. Rôle dans le produit

**Zarya Search** est l'interface de **recherche conversationnelle** sur l'ensemble du corpus documentaire d'un cabinet. Pas un moteur de recherche classique (mots-clés) : un **RAG** (Retrieval Augmented Generation) qui répond en langage naturel **avec sources visibles**.

C'est le module qui résout la douleur n°5 de Julie : "Je ne retrouve plus l'info quand j'en ai besoin."

**Promesse produit** : "Quand le client Dupont a-t-il signé son dernier avenant ?" → réponse en 3 secondes avec lien vers le document source.

**Périmètre** :
- Documents reçus par le cabinet (depuis `doc.document`)
- Contenu extrait par OCR (depuis `doc.fichier_physique.ocr_text`)
- Données structurées du CRM (clients, contacts, services, échéances)
- Données salaires (lecture seule, restrictions selon rôle)
- Documents NAS indexés

**Multi-tenant** : la recherche est **strictement scopée par cabinet**. Aucune fuite cross-tenant possible, même au niveau des embeddings. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Cas d'usage cibles

### 2.1 Recherche factuelle simple
- "Quel est le numéro IDE du client Martin SARL ?"
- "Quelle est la date de fin de mandat de Dupont SA ?"

→ Réponse : extraction directe depuis le CRM, citation de la source.

### 2.2 Recherche dans les documents
- "Combien Dupont SA a-t-il dépensé en télécom en 2025 ?"
- "Trouve tous les contrats signés avec Swisscom depuis 2023"
- "Quel était le salaire de Marie Martin en mars 2024 ?"

→ RAG sur documents + données structurées, agrégation si nécessaire.

### 2.3 Recherche transverse
- "Quels clients ont eu des amendes fiscales l'an dernier ?"
- "Y a-t-il des factures avec un IBAN qui a changé récemment ?"
- "Quels mandats arrivent à expiration dans les 6 mois ?"

→ Croisement de plusieurs sources, présentation structurée.

### 2.4 Synthèse contextuelle
- "Donne-moi le résumé du dossier Dupont SA"
- "Qu'est-ce qui a changé pour Martin SARL depuis 3 mois ?"

→ Synthèse multi-sources avec timeline.

## 3. Architecture RAG

```
[Question utilisateur]
        ↓
[Détection d'intent et de scope]
   - Recherche factuelle simple ?
   - Besoin de données structurées (SQL) ?
   - Besoin de recherche sémantique (embeddings) ?
   - Croisement nécessaire ?
        ↓
[Récupération des sources]
   ┌────────────────────────────┐
   │ A. Recherche structurée    │
   │    (SQL paramétrique sur   │
   │     CRM, factures, etc.)   │
   │                            │
   │ B. Recherche sémantique    │
   │    (pgvector embeddings    │
   │     sur documents indexés) │
   │                            │
   │ C. Recherche textuelle     │
   │    (full-text postgres     │
   │     + trigram pour fuzzy)  │
   └────────────────────────────┘
        ↓
[Re-ranking et déduplication]
        ↓
[Synthèse via LLM]
   - catégorie `chat_large` (résolue au runtime via /v1/models)
   - Prompt avec sources injectées
   - Instructions strictes : pas d'invention
        ↓
[Réponse formatée + sources cliquables]
```

## 4. Indexation

### 4.1 Sources indexées

**Tableau de couverture** :

| Source | Type d'indexation | Fréquence |
|---|---|---|
| `doc.document` (texte OCR) | Embeddings + full-text | À la validation |
| `doc.document` (métadonnées) | Structurée | À la validation |
| `crm.client` (raison sociale, notes) | Full-text + trigram | À chaque update |
| `crm.contact` | Full-text | À chaque update |
| `crm.evenement` (description) | Full-text | À chaque insert |
| `facture.facture` (champs structurés) | Structurée | À chaque insert |
| `salaire.employe` (champs accessibles) | Structurée | À chaque update |
| Fichiers NAS indexés | Embeddings + full-text | Au scan NAS |

### 4.2 Pipeline d'indexation

```
[Nouveau document validé]
        ↓
[Si OCR pas encore fait : OCR via Infomaniak vision (catégorie `vision`) — différé Phase 4.1+]
        ↓
[Chunking du texte]
   - Découpage en ~500 tokens par chunk
   - Overlap 50 tokens
   - Préservation des frontières logiques (paragraphes)
        ↓
[Génération d'embeddings]
   - Modèle : Infomaniak embeddings (catégorie `embeddings`, résolue au runtime) — différé Phase 4.1+
   - Dimension : à confirmer selon le modèle Infomaniak
        ↓
[Stockage]
   - pgvector dans search.document_chunk
   - Index HNSW pour recherche rapide
        ↓
[Indexation full-text Postgres]
   - tsvector calculé sur le contenu
   - GIN index
```

### 4.3 Choix du modèle d'embedding
Critères :
- **Multilingue** : FR, DE, IT, EN supportés
- **Latence** : < 200ms par batch
- **Coût** : maîtrisé selon pricing Infomaniak
- **Souveraineté** : Infomaniak AI Services (Suisse)

Cible : modèle de la catégorie `embeddings` Infomaniak (résolu au runtime via /v1/models, aucun model_id en dur) — **différé Phase 4.1+**.

Décision finale au moment du code, après benchmark sur corpus fiduciaire.

### 4.4 Re-indexation
Triggers :
- Document modifié (versioning) → re-indexer la nouvelle version
- Document supprimé (soft delete) → suppression de l'index
- Changement de prompt système → re-indexation globale optionnelle (Phase 2)
- Nouveau modèle d'embedding → migration progressive

## 5. Schéma de données

### 5.1 Schéma `search.*` (nouveau)

```sql
CREATE SCHEMA search;

CREATE TABLE search.document_chunk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES doc.document(id) ON DELETE CASCADE,
  client_id uuid REFERENCES crm.client(id) ON DELETE CASCADE,
  
  -- Contenu
  chunk_index integer NOT NULL,           -- 0, 1, 2... ordre dans le document
  text_content text NOT NULL,
  text_tsvector tsvector GENERATED ALWAYS AS (to_tsvector('french', text_content)) STORED,
  
  -- Embedding
  embedding vector(1024),                 -- pgvector
  embedding_model text NOT NULL,          -- catégorie 'embeddings' Infomaniak, id résolu au runtime (Phase 4.1+)
  
  -- Métadonnées pour filtrage
  document_type text,
  document_periode text,                  -- '2026-04', '2025-Q1'
  document_categorie text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_chunk_cabinet ON search.document_chunk (cabinet_id);
CREATE INDEX idx_search_chunk_client ON search.document_chunk (client_id);
CREATE INDEX idx_search_chunk_tsvector ON search.document_chunk USING GIN (text_tsvector);
CREATE INDEX idx_search_chunk_embedding ON search.document_chunk 
  USING hnsw (embedding vector_cosine_ops);
```

### 5.2 Historique des recherches

```sql
CREATE TABLE search.requete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id),
  utilisateur_id uuid NOT NULL REFERENCES auth.users(id),
  question text NOT NULL,
  intent_detecte text,                    -- 'factuelle', 'agregation', 'synthese'
  filtres_appliques jsonb,                -- {client_id: '...', date_min: '...'}
  
  -- Pipeline
  nb_chunks_recuperes integer,
  nb_chunks_utilises integer,             -- Après re-ranking
  duration_ms integer,
  
  -- LLM
  llm_invocation_id uuid REFERENCES extraction.invocation(id),
  
  -- Réponse
  reponse_text text,
  sources_citees jsonb,                   -- Tableau de {document_id, chunk_id, ...}
  
  -- Feedback utilisateur
  utile boolean,
  feedback_text text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_requete_cabinet ON search.requete (cabinet_id, created_at DESC);
CREATE INDEX idx_search_requete_user ON search.requete (utilisateur_id, created_at DESC);
```

### 5.3 Cache de questions fréquentes (Phase 2)

```sql
CREATE TABLE search.cache_question (
  id uuid PRIMARY KEY,
  cabinet_id uuid NOT NULL,
  question_hash text NOT NULL,
  reponse_cachee text,
  sources_cachees jsonb,
  hit_count integer DEFAULT 0,
  expire_at timestamptz,
  
  UNIQUE(cabinet_id, question_hash)
);
```

## 6. Pipeline de recherche détaillé

### 6.1 Étape 1 — Détection d'intent
LLM léger (catégorie `chat_small`) qui classifie la question :

```typescript
type Intent = 
  | { type: 'factuelle_directe', entite: string, attribut: string }
  | { type: 'recherche_documents', filtres: Filtres, mots_cles?: string }
  | { type: 'agregation', dimension: string, mesure: string, filtres: Filtres }
  | { type: 'synthese_dossier', client_id: string }
  | { type: 'hors_scope' };
```

Exemples :
- "Quel est l'IDE de Dupont SA ?" → `factuelle_directe`
- "Combien de factures Swisscom en 2025 ?" → `agregation`
- "Résume-moi Dupont SA" → `synthese_dossier`
- "Quel temps fait-il ?" → `hors_scope` (réponse polie de redirection)

### 6.2 Étape 2 — Récupération
Selon l'intent :

**Factuelle directe** :
- Query SQL paramétrée sur CRM/Salaire/Facture
- Pas de LLM nécessaire pour la réponse

**Recherche documents** :
- Embedding de la requête
- Recherche cosine top-K (K=10) dans `search.document_chunk` filtrée par `cabinet_id`
- Combinaison avec recherche full-text si mots-clés présents
- Re-ranking via reciprocal rank fusion (RRF)

**Agrégation** :
- LLM génère une query SQL (text-to-SQL) sur un schéma restreint et sécurisé
- **Validation stricte** de la query avant exécution (whitelist d'opérations, pas de mutations)
- Exécution et formatage du résultat

**Synthèse dossier** :
- Récupération multi-sources : CRM, événements récents, documents clés
- LLM catégorie `chat_large` pour synthèse longue

### 6.3 Étape 3 — Génération de la réponse
Prompt système type :

```
Tu es un assistant de recherche pour un cabinet fiduciaire suisse.
Tu réponds aux questions en utilisant UNIQUEMENT les sources fournies.

Règles :
1. Si tu n'as pas l'info dans les sources, dis-le clairement
2. Cite chaque fait avec son source ([1], [2], etc.)
3. Sois concis : 2-5 phrases en général
4. Format les dates en jj/mm/aaaa
5. Format les montants en CHF avec apostrophe pour milliers
6. N'invente jamais de chiffre, de date, ou de nom
7. Si la question est ambiguë, demande une précision

Sources disponibles :
[1] Document "contrat_dupont_2024.pdf" (signé le 12/03/2024) : ...
[2] CRM client Dupont SA, champ ide : "CHE-123.456.789"
[3] Facture #INV-2025-042 du 15/04/2025 : montant 2'450.00 CHF
...

Question : {question}
```

### 6.4 Étape 4 — Citation des sources
Chaque source citée dans la réponse est cliquable :
- Document → ouverture dans le viewer ZARYA avec scroll sur le passage pertinent
- Champ CRM → navigation vers la fiche client
- Facture → ouverture de la facture

UI :
```
Le dernier mandat de Dupont SA a été signé le 12 mars 2024 [1]
pour une durée de 3 ans, expirant le 12 mars 2027.

Sources :
[1] Contrat_dupont_2024.pdf • signé 12/03/2024 • [Voir le document →]
```

## 7. Interface utilisateur

### 7.1 Surface principale
Barre de recherche universelle accessible via :
- Raccourci `Cmd/Ctrl + K` partout dans l'app
- Bouton dédié dans la sidebar
- Page `/search` complète

### 7.2 Suggestions
Au focus, suggestions contextuelles :
- "Mes documents récents"
- "Synthèse du dossier {client courant}"
- "Mes échéances de la semaine"
- Historique des recherches précédentes (par cabinet)

### 7.3 Filtres
Pré-filtres rapides :
- Par client
- Par période
- Par type de document
- Par responsable

### 7.4 Vue résultats
```
┌────────────────────────────────────────────────┐
│ 🔍 quand a été signé le contrat dupont        │
├────────────────────────────────────────────────┤
│                                                │
│ Le dernier contrat avec Dupont SA a été       │
│ signé le 12 mars 2024 [1] pour 3 ans.         │
│ Il expire le 12 mars 2027.                    │
│                                                │
│ ── Sources ──                                  │
│ [1] 📄 contrat_dupont_2024.pdf                 │
│     Catégorie : commercial · 12/03/2024        │
│     [Ouvrir le document →]                     │
│                                                │
│ 👍  👎  💬 Préciser                            │
└────────────────────────────────────────────────┘
```

### 7.5 Conversation
Une recherche peut continuer en conversation :
- "Et avant celui-là ?"
- "Quels étaient les termes du précédent ?"
- "Compare-les"

Contexte conservé dans la session (pas en DB sauf opt-in).

## 8. Sécurité et confidentialité

### 8.1 Isolation multi-tenant
**Critique absolue** : un cabinet ne doit JAMAIS recevoir un résultat issu d'un autre cabinet, même en cas de bug LLM.

Protections :
- RLS Postgres systématique sur `search.document_chunk` (filtre par `cabinet_id`)
- Vérification applicative redondante : le `cabinet_id` du contexte user est comparé à celui de chaque chunk avant injection dans le prompt
- Tests d'isolation obligatoires : un user du cabinet A pose une question qui pourrait matcher des docs du cabinet B → 0 résultat

### 8.2 Champs invisibles selon rôle

**Membres cabinet** :
- Tous les modules accessibles
- Exception `gestionnaire_salaires` : peut voir tous les salaires
- Exception `collaborateur` : ne peut pas voir les salaires détaillés (sauf si autorisé explicitement)

**Contact RH client** (Phase 2, hors-scope MVP) :
- Recherche **uniquement** sur ses propres documents et données client
- Pas d'accès aux notes internes cabinet
- Pas d'accès au scoring de risque

### 8.3 Données envoyées au LLM
Au moment de la génération :
- Sources injectées contiennent UNIQUEMENT des données du cabinet authentifié
- Pas de mélange dans un seul appel LLM
- Logging dans `extraction.invocation` avec `cabinet_id`

### 8.4 Données sensibles dans les sources
Certains champs ne doivent jamais être envoyés au LLM :
- Mots de passe (jamais stockés en clair de toute façon)
- Credentials OAuth chiffrés
- Tokens API

Filtrage applicatif avant injection dans le prompt.

### 8.5 Anti-injection
Les sources sont encadrées par des balises XML strictes :
```
<source id="1" type="document">
Le contenu du document ici...
</source>

<source id="2" type="crm_field">
Champ ide : CHE-123.456.789
</source>
```

Le LLM est instruit de **ne pas suivre d'instructions** trouvées dans le contenu des sources (qui pourrait être manipulé par un attaquant via un email contenant un prompt malicieux).

## 9. Performance et coûts

### 9.1 Latences cibles
- Détection d'intent : < 500ms (catégorie `chat_small`)
- Récupération chunks : < 200ms (pgvector HNSW)
- Génération réponse (catégorie `chat_large`) : 2-5 secondes
- **Total p50** : < 5 secondes
- **Total p95** : < 10 secondes

Streaming progressif de la réponse pour améliorer la perception.

### 9.2 Coûts
Par recherche moyenne :
- Embedding question : ~0.0001 USD
- Récupération (DB only) : négligeable
- Catégorie `chat_large` pour synthèse : ~0.05 USD (10K tokens output, ordre de grandeur)
- **Coût moyen par recherche** : ~0.05 USD

Pour 200 recherches/cabinet/mois : ~10 USD/mois/cabinet. Intégré dans le pricing global.

### 9.3 Optimisations
- **Cache de questions** (Phase 2) : questions fréquentes mises en cache 24h
- **Batch embeddings** : indexation en batch pour réduire les appels Infomaniak
- **Filtres précoces** : RLS et filtres SQL avant recherche sémantique
- **HNSW** plutôt qu'IVFFlat pour pgvector (meilleur rappel/latence)

## 10. Évaluation qualitative

### 10.1 Set d'évaluation
50-100 questions annotées par contexte fiduciaire suisse :
- Questions factuelles simples
- Questions ambiguës
- Questions hors-scope
- Questions piège (deux clients homonymes, etc.)

### 10.2 Métriques
- **Précision des sources** : sources citées sont effectivement pertinentes
- **Rappel** : on trouve l'info quand elle existe
- **Précision factuelle** : pas d'invention (hallucination rate < 2%)
- **Pertinence ressentie** : feedback utilisateur (👍/👎)

### 10.3 Tests adversariaux
- Questions sur des données d'un autre cabinet (doit retourner "pas d'info")
- Questions sur des champs sensibles non autorisés au rôle
- Injection de prompt via contenu de document

## 11. Modes spécifiques

### 11.1 Mode "Dossier client"
Vue dédiée par client avec recherche pré-filtrée sur ce client uniquement :
- "Synthèse de ce client"
- "Échéances à venir"
- "Documents récents"
- "Anomalies détectées"

### 11.2 Mode "Comparaison"
"Compare Dupont SA et Martin SARL sur 2025" → réponse structurée en tableau.

### 11.3 Mode "Tendances" (Phase 2)
"Quelle évolution des honoraires sur 12 mois ?" → graphique généré + commentaire.

## 12. Intégration avec autres modules

### 12.1 Module Doc
- Indexation automatique à la validation
- Re-indexation si modification

### 12.2 Module CRM
- Indexation des champs textuels (raison sociale, notes, événements)
- Mise à jour temps réel

### 12.3 Module Facture
- Indexation structurée des factures pour agrégations
- Recherche par fournisseur, montant, catégorie

### 12.4 Module Calendar
- Recherche des échéances et historique des relances

### 12.5 Module Salaire
- Recherche sur employés (avec restrictions de rôle)
- Pas d'agrégation de salaires sans permission explicite

## 13. UX et accessibilité

### 13.1 Suggestions intelligentes
Pendant la frappe :
- Auto-complétion basée sur l'historique
- Suggestions de questions populaires pour ce cabinet

### 13.2 Reformulation assistée
Si la question est ambiguë :
- "Voulez-vous dire ... ?"
- Bouton de reformulation par l'utilisateur

### 13.3 Feedback
Après chaque réponse :
- 👍 / 👎
- Bouton "Pas la bonne réponse" → option de signaler avec commentaire
- Stockage dans `search.requete.utile` pour amélioration continue

### 13.4 Mode mobile
Recherche disponible sur mobile (Dashboard Client Phase 2).

## 14. Hors-scope MVP

- **Mode conversationnel multi-tours** persistant : juste session courante au MVP
- **Recherche dans le dashboard client** (Phase 2)
- **Synthèses générées proactivement** (résumé hebdo automatique)
- **Visualisations dans les réponses** (graphiques, tableaux complexes)
- **Génération de documents** ("Crée un courrier de relance pour X")
- **Recherche multilingue cross-langue** (chercher en FR dans des docs DE)
- **Mode vocal** (recherche par dictée)
- **Connexion à des sources externes** (Google, sites publics)
- **Fine-tuning** sur les données du cabinet
- **Notifications proactives** basées sur la recherche

## 15. Questions ouvertes

- [ ] **Modèle d'embedding** : quel modèle de la catégorie `embeddings` Infomaniak ? À benchmarker sur corpus fiduciaire (différé Phase 4.1+)
- [ ] **Taille des chunks** : 500 tokens ou variable selon le type de document ?
- [ ] **Re-ranking** : nécessaire au MVP ou cosine top-K suffit ?
- [ ] **Text-to-SQL** : librairie tierce ou prompt custom ? Sécurité du SQL généré ?
- [ ] **Latence** : tolérable jusqu'à 10s avec streaming ?
- [ ] **Conversation persistée** : opt-in cabinet ou jamais persistée ?
- [ ] **Historique partagé** : un user voit-il les recherches des collègues du même cabinet ?
- [ ] **Recherche dans les pièces jointes des emails** : intégration au pipeline d'indexation ?
- [ ] **Documents archivés** : inclus dans la recherche par défaut ou non ?
- [ ] **Modèle de coût** : facturation à l'usage transparente ou abonnement avec quota ?
- [ ] **Détection d'intent hors-scope** : niveau de tolérance (météo OK, sujets sensibles non) ?
