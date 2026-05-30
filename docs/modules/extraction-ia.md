---
status: draft
owner: tristan
last_updated: 2026-05-26
priority: P0
module: extraction-ia
depends_on: [llm-strategy, multi-tenant]
referenced_by: [onboarding-client, onboarding-fiduciaire, doc, facture]
---

# Zarya — Extraction IA (brique transverse)

## 1. Rôle dans le produit

L'**Extraction IA** est une **brique transverse** réutilisée par plusieurs modules ZARYA pour transformer du contenu non structuré (PDF, Excel, image, email) en données structurées validées.

Ce n'est pas un module produit visible par l'utilisateur, c'est un **service interne** consommé par :

| Module consommateur | Cas d'usage |
|---|---|
| Onboarding Client | Extraction des employés depuis Excel/PDF |
| Onboarding Fiduciaire | Extraction du portefeuille clients depuis Excel/CSV |
| Doc | Classification et extraction de métadonnées de documents reçus |
| Facture | Extraction des champs de facture (fournisseur, IBAN, montants, TVA, dates) |
| Salaire | Détection de changements employés depuis emails clients |
| Search | Génération d'embeddings, synthèse RAG |

**Principe directeur** : un pipeline générique configurable, pas un code dupliqué par module.

**Multi-tenant** : toutes les extractions sont scopées par `cabinet_id`. Voir [`/docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md).

## 2. Architecture du pipeline

```
[Input : fichier ou texte]
       ↓
[1. Détection du type]
       ↓
   ┌──────────────────┐
   ↓                  ↓
[2a. OCR]         [2b. Parse direct]
(si scan/image)    (si texte/structure)
   ↓                  ↓
   └────────┬─────────┘
            ↓
[3. Choix du modèle LLM]
   (catégorie chat_large pour qualité, chat_small pour volume)
            ↓
[4. Prompt système versionné + schéma cible]
            ↓
[5. Appel Infomaniak AI Services (Suisse)]
            ↓
[6. Validation du JSON output]
   (Zod schema, retry si invalide)
            ↓
[7. Détection d'anomalies et doublons]
            ↓
[8. Persistance en base]
   (table cible définie par le module appelant)
            ↓
[Output : propositions structurées + confidence]
```

## 3. Use cases avec leurs spécificités

### 3.1 Extraction d'employés (onboarding client)
- Input : Excel structuré (export Odoo/SAP/Tipee) ou PDF de contrats
- Modèle : catégorie `chat_large` (résolu au runtime via /v1/models) — qualité critique pour données nominatives
- OCR si scan : Infomaniak vision (catégorie `vision`) — différé Phase 4.1+
- Schéma cible : `salaire.proposition_employe` + `salaire.proposition_champ` (granulaire)
- Validation : champ par champ
- Volume typique : 5-50 employés par session

### 3.2 Extraction de clients (onboarding fiduciaire)
- Input : Excel export Bexio CRM, Abacus, ou Excel libre
- Modèle : catégorie `chat_large` (résolu au runtime via /v1/models)
- Schéma cible : `crm.proposition_client`
- Validation : en lot (moins de champs critiques)
- Volume typique : 50-200 clients par import

### 3.3 Classification de documents (Doc)
- Input : email + pièces jointes
- Modèle : catégorie `chat_small` (résolu au runtime) — rapide, volume élevé
- Pas d'OCR typiquement (déjà en texte)
- Schéma cible : `doc.proposition_classement` (type, client, période)
- Validation : 1-clic par l'utilisateur
- Volume typique : 50-200 documents par jour par cabinet

### 3.4 Extraction de factures (Facture)
- Input : PDF de facture (scannée ou numérique)
- Modèle : catégorie `chat_large` (résolu au runtime) — précision critique sur montants
- OCR pour PDF scannés : Infomaniak vision (catégorie `vision`) — différé Phase 4.1+
- Schéma cible : `facture.proposition_facture` (15+ champs)
- Validation : avec bbox source surlignées
- Volume typique : 30-100 factures par mois par client

### 3.5 Détection de changements salariaux (Salaire)
- Input : email d'un contact RH client
- Modèle : catégorie `chat_small` (résolu au runtime)
- Schéma cible : `salaire.changement` proposé
- Validation : humaine systématique
- Volume typique : 1-5 par client par mois

### 3.6 Génération d'embeddings et RAG (Search)
- Input : documents indexés + requête utilisateur
- Modèle : Infomaniak embeddings (catégorie `embeddings`) + catégorie `chat_large` pour synthèse — différé Phase 4.1+
- Stockage : pgvector
- Validation : sources affichées dans la réponse
- Volume typique : ~200 requêtes par cabinet par mois

## 4. API interne du module

Le module Extraction IA expose une **API TypeScript unifiée** consommée par les autres modules.

### 4.1 Interface

```typescript
// /lib/extraction/types.ts

export type ExtractionContext = 'employes' | 'clients' | 'classification_doc' 
                              | 'facture' | 'changement_salaire' | 'autre';

export interface ExtractionRequest<TSchema> {
  cabinet_id: string;
  context: ExtractionContext;
  input: ExtractionInput;
  target_schema: ZodSchema<TSchema>;
  options?: ExtractionOptions;
}

export interface ExtractionInput {
  type: 'file' | 'text' | 'document_id';
  file?: { document_id: string; mime_type: string };
  text?: string;
}

export interface ExtractionOptions {
  model_override?: 'chat_large' | 'chat_small';  // catégorie, résolue au runtime
  prompt_version?: string;          // Pin une version de prompt spécifique
  enable_ocr?: boolean;              // True par défaut si MIME image/PDF — Phase 4.1+
  ocr_engine?: 'infomaniak_vision' | 'auto';     // catégorie vision — différé Phase 4.1+
  retry_on_validation_error?: boolean;
  max_retries?: number;
  detect_duplicates?: boolean;       // True par défaut
  duplicate_keys?: string[];         // Champs à utiliser pour la détection
}

export interface ExtractionResult<TSchema> {
  extraction_id: string;
  items: ExtractedItem<TSchema>[];
  metadata: {
    model_used: string;               // catégorie résolue au runtime (chat_small/chat_large)
    prompt_version: string;
    bedrock_request_id: string;       // nom hérité (ADR 0010) ; porte désormais l'ID de requête Infomaniak
    duration_ms: number;
    tokens_in: number;
    tokens_out: number;
    cost_chf: number;
  };
}

export interface ExtractedItem<TSchema> {
  data: TSchema;
  confidence_overall: number;
  fields_confidence: Record<keyof TSchema, FieldConfidence>;
  anomalies: string[];
  duplicates?: { item_id: string; similarity: number }[];
  source: SourceReference;
}

export interface FieldConfidence {
  value: any;
  confidence: number;
  source_location?: BoundingBox;  // Pour PDFs avec bbox
  source_cell?: string;            // Pour Excel "A12"
}
```

### 4.2 Exemple d'utilisation côté module appelant

```typescript
// Dans onboarding-client : extraction d'employés depuis un Excel
import { extract } from '@/lib/extraction';
import { EmployeSchema } from '@/lib/schemas/employe';

const result = await extract({
  cabinet_id: ctx.cabinet_id,
  context: 'employes',
  input: { 
    type: 'document_id', 
    file: { document_id: upload.document_id, mime_type: 'application/vnd.ms-excel' } 
  },
  target_schema: EmployeSchema,
  options: {
    model_override: 'chat_large',
    detect_duplicates: true,
    duplicate_keys: ['numero_avs', 'nom_prenom_naissance'],
  },
});

// Persister les propositions
for (const item of result.items) {
  await db.proposition_employe.create({
    cabinet_id: ctx.cabinet_id,
    extraction_id: result.extraction_id,
    confidence_globale: item.confidence_overall,
    anomalies_detectees: item.anomalies,
    // ... copier les champs depuis item.data
  });
}
```

## 5. Pipeline détaillé

### 5.1 Étape 1 — Détection du type
À partir du `mime_type` + analyse du contenu :
- `application/pdf` → vérifier si texte natif ou scan
- `application/vnd.ms-excel`, `.xlsx`, `.csv` → parse direct sans OCR
- `image/*` → OCR obligatoire
- `application/xml`, `application/json` → parse direct
- `message/rfc822` (email) → parse + extraction texte
- Inconnu → tenter détection magic bytes, sinon échec gracieux

### 5.2 Étape 2 — OCR si nécessaire
Via Infomaniak vision (catégorie `vision`) — **différé Phase 4.1+**. Voir [`/docs/architecture/llm-strategy.md` § 5](../architecture/llm-strategy.md).

Configuration (cible) :
- Timeout : 30s
- Retry : 2 fois avec backoff exponentiel
- Fallback : si le service vision est indisponible, file d'attente + notification

Output : texte brut + métadonnées (pages, bbox des blocs détectés).

> **Donnée de paiement = décodage déterministe avant tout LLM.** Pour les documents
> porteurs d'un **QR-bill suisse** (factures CH), le payload de paiement (IBAN/QR-IBAN,
> créancier, montant, devise, référence) se lit directement par décodage du QR code SIX,
> **jamais** via OCR/LLM (fiabilité ~100%, gratuit, zéro hallucination). L'OCR/vision et
> l'IA ne complètent que les champs hors QR. Détail dans
> [`/docs/modules/facture.md` § 4.4](./facture.md). Implémentation au module Facture.

### 5.3 Étape 3 — Choix du modèle
Logique par défaut (peut être overridée via `options.model_override`) :

| Contexte | Catégorie par défaut (résolue au runtime) |
|---|---|
| `employes`, `clients`, `facture` | `chat_large` |
| `classification_doc`, `changement_salaire` | `chat_small` |
| `autre` | `chat_large` |

### 5.4 Étape 4 — Prompt + schéma
Les prompts sont **versionnés** dans le code (`/lib/extraction/prompts/`). Voir [`/docs/architecture/llm-strategy.md` § 6](../architecture/llm-strategy.md).

Chaque prompt :
- A une version explicite (ex. `v1.2.0`)
- A un schéma Zod cible qui définit l'output JSON attendu
- Est testé sur un set d'évaluation interne avant déploiement

Construction du message envoyé :

```typescript
const messages = [
  {
    role: 'system',
    content: prompts[context][version].system,
  },
  {
    role: 'user',
    content: [
      { type: 'text', text: prompts[context][version].user_template },
      { type: 'text', text: `<document>${extractedText}</document>` },
      // Bbox info si disponible
    ],
  },
];
```

### 5.5 Étape 5 — Appel Infomaniak AI Services
Voir [`/docs/architecture/llm-strategy.md` § 4](../architecture/llm-strategy.md) pour le détail du wrapper.

Wrapping spécifique extraction :
- `response_format: { type: 'json_schema', json_schema: ... }` (mode JSON strict)
- `temperature: 0.1` (extraction = peu créatif)
- `max_tokens` calibré par contexte

### 5.6 Étape 6 — Validation du JSON
Le JSON renvoyé par le modèle est validé contre le schéma Zod :

```typescript
const parsed = TargetSchema.safeParse(rawOutput);
if (!parsed.success) {
  // Retry avec instruction de correction si options.retry_on_validation_error
  if (options.retry_on_validation_error && retryCount < maxRetries) {
    return retryWithCorrection(parsed.error);
  }
  // Sinon échec gracieux
  throw new ExtractionValidationError(parsed.error);
}
```

### 5.7 Étape 7 — Détection d'anomalies et doublons

**Anomalies** : règles métier appliquées par contexte
- Employé : AVS checksum invalide, date d'entrée future, salaire < 1000 CHF
- Facture : TVA incohérente avec HT/TTC, IBAN format invalide, montant négatif
- Client : IDE checksum invalide, doublon de raison sociale dans le cabinet

**Doublons** : recherche par `duplicate_keys` (configurable par contexte)
- Employé : `numero_avs` exact, sinon similarité `nom_prenom_date_naissance` > 0.85
- Client : `ide` exact, sinon similarité `raison_sociale` > 0.90 (trigram)
- Facture : `fournisseur_id + numero_facture`

### 5.8 Étape 8 — Persistance
Chaque extraction est persistée dans `extraction.invocation` (table générique) + dans la table cible spécifique au module (proposition_employe, proposition_client, etc.).

Voir schéma ci-dessous.

## 6. Schéma de données générique

Table générique pour tracer **toutes** les invocations d'extraction, quel que soit le contexte.

### 6.1 Schéma `extraction.*` (nouveau)

```sql
CREATE SCHEMA extraction;

CREATE TABLE extraction.invocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES crm.cabinet(id) ON DELETE RESTRICT,
  context text NOT NULL,                    -- 'employes', 'clients', etc.
  invoked_by_module text NOT NULL,          -- 'onboarding-client', 'doc', etc.
  invoked_by_user_id uuid,                  -- auth.users si humain
  
  -- Input
  input_type text NOT NULL,                 -- 'file', 'text', 'document_id'
  input_document_id uuid,                   -- FK doc.document si applicable
  input_text_hash text,                     -- SHA256 du texte si input direct (audit)
  input_size_bytes bigint,
  
  -- Configuration de l'appel
  model_used text NOT NULL,                 -- catégorie résolue au runtime (chat_small/chat_large)
  bedrock_region text NOT NULL DEFAULT 'eu-central-1',  -- colonne héritée (ADR 0010, superseded 0003) ; conservée
  bedrock_request_id text,                  -- colonne héritée (ADR 0010) ; porte l'ID de requête Infomaniak
  prompt_version text NOT NULL,
  ocr_engine text,                          -- 'infomaniak_vision' si applicable — différé Phase 4.1+
  ocr_duration_ms integer,
  
  -- Résultats
  status text NOT NULL,                     -- 'success', 'validation_error', 'timeout', 'rate_limit', 'unknown_error'
  nb_items_extracted integer DEFAULT 0,
  nb_items_with_anomalies integer DEFAULT 0,
  raw_output jsonb,                         -- Output brut LLM (audit)
  error_message text,
  
  -- Métriques
  total_duration_ms integer,
  tokens_input integer,
  tokens_output integer,
  cost_chf numeric(8, 4),
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_extraction_invocation_cabinet 
  ON extraction.invocation (cabinet_id, created_at DESC);
CREATE INDEX idx_extraction_invocation_context 
  ON extraction.invocation (context, status);
CREATE INDEX idx_extraction_invocation_cost 
  ON extraction.invocation (cabinet_id, created_at) 
  INCLUDE (cost_chf);
```

Cette table sert à :
- **Auditer** chaque appel LLM (conformité, debug, postmortem)
- **Mesurer les coûts** par cabinet, par contexte, par modèle
- **Identifier les régressions** quand on change un prompt
- **Calculer la facturation à l'usage** si on adopte ce modèle

### 6.2 Tables par module (référencées)
Chaque module produit ses propres tables de propositions :
- `salaire.proposition_employe`, `salaire.proposition_champ` (onboarding client)
- `crm.proposition_client` (onboarding fiduciaire)
- `doc.proposition_classement`
- `facture.proposition_facture`

Toutes référencent `extraction.invocation.id` via une colonne `extraction_id`.

## 7. Gestion des prompts

### 7.1 Stockage
Les prompts sont **dans le code source** sous `/lib/extraction/prompts/<context>/<version>.ts`.

Pas en base de données : permet le versionnage Git, la review en PR, l'A/B testing par déploiement.

### 7.2 Format d'un prompt

```typescript
// /lib/extraction/prompts/employes/v1_2_0.ts
import { z } from 'zod';

export const EXTRACT_EMPLOYES_V1_2_0 = {
  version: 'v1.2.0',
  model_category: 'chat_large' as const,  // résolu au runtime via /v1/models (aucun model_id en dur)
  
  system: `Tu es un assistant spécialisé dans l'extraction de données employés
pour un onboarding fiduciaire suisse.

Tu reçois un document (Excel, PDF, ou texte) contenant des informations sur
des employés. Extrait UNIQUEMENT les employés effectivement présents.

Règles :
- AVS au format 756.XXXX.XXXX.XX (sinon null)
- Salaire en CHF (sinon convertir et indiquer)
- Date format ISO YYYY-MM-DD
- Si information absente : null (pas d'inférence)
- Confidence : 1.0 si exact, 0.7 si déduit, 0.3 si très incertain

Tu réponds UNIQUEMENT en JSON valide.`,
  
  user_template: `Voici le document à analyser :

{{document_content}}

Extrait tous les employés au format JSON suivant :
{{schema_description}}`,
  
  schema: z.array(z.object({
    prenom: z.string(),
    nom: z.string(),
    date_naissance: z.string().nullable(),
    sexe: z.enum(['m', 'f', 'autre']).nullable(),
    numero_avs: z.string().regex(/^756\.\d{4}\.\d{4}\.\d{2}$/).nullable(),
    // ... tous les champs Swissdec
    _confidence: z.record(z.string(), z.number().min(0).max(1)),
  })),
  
  max_tokens: 8192,
  temperature: 0.1,
};
```

### 7.3 Versionnage
- Toute modification de prompt = bump de version
- Anciennes versions conservées pour reproductibilité et A/B
- `extraction.invocation.prompt_version` permet de tracer

### 7.4 Évaluation
Set d'évaluation : 50-100 cas réels annotés par contexte, en `/lib/extraction/evals/`.

Avant déploiement d'une nouvelle version :
- Exécution sur le set d'éval
- Métriques : précision par champ, taux d'hallucination, coût moyen
- Comparaison avec la version précédente
- Bascule manuelle si validée

## 8. Gestion des coûts

### 8.1 Estimation par invocation
Calculée à partir des tokens consommés et du pricing Infomaniak du modèle utilisé. Voir [`/docs/architecture/llm-strategy.md` § 8](../architecture/llm-strategy.md).

### 8.2 Quotas par cabinet
- **Soft limit** : alerte quand le cabinet approche son quota mensuel
- **Hard limit** : blocage temporaire avec message clair + upsell possible

Quotas suggérés (à valider) :
- Starter : 100 CHF/mois d'usage LLM inclus
- Pro : 500 CHF/mois
- Enterprise : illimité

### 8.3 Anti-abuse
- Rate limiting par cabinet (max N invocations / minute)
- Détection d'usage anormal (10x la moyenne habituelle)
- Alertes ops

## 9. Gestion d'erreurs

### 9.1 Échecs côté LLM
- Throttling / `429` Infomaniak : retry exponentiel automatique
- Erreur de validation de requête : pas de retry, échec immédiat (problème de prompt)
- Timeout : retry 1 fois, puis échec gracieux

### 9.2 Échecs de validation JSON
- Retry avec instruction explicite de correction si `retry_on_validation_error`
- Max 2 retries
- Si toujours invalide : statut `validation_error`, le module appelant gère

### 9.3 Échecs OCR
- Fallback : tentative sans OCR (extraction directe du texte brut si possible)
- Sinon : statut `ocr_failed`, notification utilisateur

### 9.4 Gestion par le module appelant
Le module Extraction IA ne décide pas quoi faire en cas d'échec. Il **remonte** l'erreur avec contexte et le module appelant choisit :
- Onboarding : afficher message à l'utilisateur, proposer saisie manuelle
- Doc : laisser le document non classé, à traiter manuellement
- Facture : marquer comme `extraction_echec`, alerte gestionnaire

## 10. Métriques à instrumenter

### 10.1 Métriques de performance
- Latence p50/p95/p99 par contexte
- Taux de succès par contexte
- Taux de retry par contexte
- Taux d'utilisation OCR

### 10.2 Métriques de qualité
- Taux d'items validés sans modification par l'utilisateur
- Taux d'anomalies détectées correctement
- Taux de faux positifs sur les doublons
- Taux de hallucinations détectées en post-validation

### 10.3 Métriques business
- Coût LLM moyen par cabinet par mois
- Coût LLM par contexte (rentabilité de chaque feature IA)
- Volume d'extractions par cabinet (signal d'adoption)

Observabilité (métriques/logs) + tableau de bord interne ZARYA.

## 11. Sécurité

### 11.1 Données envoyées au LLM
Avant chaque appel :
- Vérification que `cabinet_id` est bien injecté
- Pas de mélange de données de cabinets différents dans un même appel
- Pas d'envoi de mots de passe / credentials (filtrage des champs sensibles)
- AVS et IBAN envoyés tels quels (nécessaires pour l'extraction, Infomaniak contractuellement engagé à ne pas entraîner)

### 11.2 Injection de prompt
Tout contenu utilisateur est :
- Encadré par des balises XML (`<document>`, `<user_input>`)
- Échappé des caractères de contrôle XML/JSON
- Tronqué si dépassement de la fenêtre de contexte (signal d'alerte si fréquent)

### 11.3 RLS sur `extraction.invocation`
Pattern multi-tenant standard : un cabinet voit uniquement ses propres invocations.

## 12. Évolution future

### Phase 2
- **Cache de prompts** Infomaniak (réduction de -90% des tokens d'input pour prompts longs)
- **Batch API** Infomaniak pour les extractions non temps réel (réduction des coûts ×2)
- **Templates de mapping** pré-définis pour formats récurrents (Odoo, SAP, Bexio export)
- **Fine-tuning** sur les données ZARYA anonymisées (qualité++, coût--)

### Phase 3
- Module visuel pour le **debug d'extraction** (rejeu d'une extraction, affichage bbox)
- Outil interne ZARYA pour **améliorer les prompts** depuis le feedback réel
- Auto-amélioration : détecter les patterns de correction utilisateur et les intégrer

## 13. Hors-scope MVP

- Extraction multi-document fusionnée (corréler contrat + AVS + IBAN dans une seule extraction)
- Streaming des résultats (utile UX si extraction très longue)
- Re-jeu d'une extraction avec un autre prompt (debug avancé)
- Apprentissage par renforcement humain (RLHF) sur les corrections utilisateur
- Modèles fine-tunés sur les données ZARYA
- Auto-détection du modèle optimal selon le contenu

## 14. Questions ouvertes

- [ ] **Stockage du `raw_output` LLM** dans `extraction.invocation` : durée de rétention ? (audit vs RGPD)
- [ ] **Réutilisation des extractions** : si le même fichier est uploadé 2 fois, on rejoue ou on cache ?
- [ ] **Coût LLM facturé au cabinet** : facturation à l'usage transparent, ou inclus dans l'abonnement ?
- [ ] **Politique de quotas** : valeurs exactes à valider en pilote
- [ ] **Versionnage prompts en DB** : à terme, pour permettre aux cabinets d'avoir des prompts custom ?
- [ ] **Détection de PII** (informations personnelles non nécessaires) à filtrer automatiquement avant envoi LLM ?
- [ ] **Politique en cas de désaccord systémique** entre l'IA et l'utilisateur : feedback loop d'amélioration ?
