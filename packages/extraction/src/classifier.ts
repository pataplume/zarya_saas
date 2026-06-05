// Brique de classification documentaire (contexte 'classification_doc').
//
// Stratégie : un seul contrat `Classifier` derrière le flag EXTRACTION_MODE.
//  - mode "stub"  : heuristique locale déterministe (aucun appel réseau).
//  - mode "live"  : Infomaniak AI Services (catégorie chat_small) — souveraineté
//                   suisse, cf. ADR 0010. Implémentation : ./infomaniak-classifier.
// Ce fichier ne fait aucun appel réseau lui-même ; la persistance (invocation +
// proposition) vit dans classify-document.ts, l'appel LLM dans infomaniak-classifier.

// Import du mode live. La résolution se fait à l'instanciation (runtime), pas à
// l'évaluation du module : le cycle classifier ↔ infomaniak-classifier est donc sûr.
import { cabinet, db, eq } from "@zarya/db";
import { InfomaniakClassifier } from "./infomaniak-classifier";

export type ExtractionMode = "stub" | "live";

// Miroir de doc.categorie_document (packages/db/src/schema/doc.ts)
export type CategorieDocument =
  | "bancaire"
  | "fiscal"
  | "salaire"
  | "commercial"
  | "administratif"
  | "autre";

export interface ClassificationInput {
  nom_fichier: string;
  ocr_text?: string | null;
  type_mime?: string;
}

export interface ClassificationProposal {
  type: string; // slug standardisé (doc.md § 4.1)
  categorie: CategorieDocument;
  libelle: string;
  periode: string | null;
  confiance_globale: number; // 0..1
  confiance_par_champ: Record<string, number>;
  anomalies: string[];
}

// Consommation tokens/coût d'une invocation LLM (renseignée par le mode live ;
// le stub la laisse absente → le pipeline retombe sur 0).
export interface ClassificationUsage {
  tokens_input: number;
  tokens_output: number;
  cost_usd?: string;
}

export interface ClassificationResult {
  proposal: ClassificationProposal;
  model_used: string;
  prompt_version: string;
  duration_ms: number;
  raw_output: unknown;
  usage?: ClassificationUsage;
}

export interface Classifier {
  readonly mode: ExtractionMode;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

export class ExtractionNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionNotImplementedError";
  }
}

// Erreur typée du chemin d'extraction live (LLM). Catch ciblé côté pipeline.
export class ExtractionError extends Error {
  constructor(
    public readonly code:
      | "CONFIG"
      | "LLM_ERROR"
      | "TIMEOUT"
      | "RATE_LIMIT"
      | "VALIDATION_FAILED"
      | "OCR_FAILED",
    message: string,
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

// ─── Heuristique stub ──────────────────────────────────────────────────────────

type Regle = { motifs: RegExp; type: string; categorie: CategorieDocument };

// Ordre important : la première règle qui matche gagne.
const REGLES: Regle[] = [
  {
    motifs: /(certificat).*(salaire)|(salaire).*(certificat)/,
    type: "certificat_salaire",
    categorie: "fiscal",
  },
  {
    // \bcompte et \bcs\b ancrés : éviter le faux positif "décompte" → releve.
    motifs: /(releve|relevé|bank|ubs|postfinance|raiffeisen|\bcs\b|\bcompte)/,
    type: "releve_bancaire",
    categorie: "bancaire",
  },
  { motifs: /(facture|invoice|qr-?facture)/, type: "facture_fournisseur", categorie: "commercial" },
  { motifs: /(tva|vat)/, type: "declaration_tva", categorie: "fiscal" },
  { motifs: /(impot|impôt|taxation|afc)/, type: "declaration_impot", categorie: "fiscal" },
  {
    motifs: /(decompte|décompte|fiche.?salaire|paie|payslip)/,
    type: "decompte_salaire",
    categorie: "salaire",
  },
  { motifs: /(avenant)/, type: "avenant_contrat", categorie: "salaire" },
  { motifs: /(contrat)/, type: "contrat_travail", categorie: "salaire" },
  { motifs: /(avs|ahv)/, type: "declaration_avs", categorie: "salaire" },
  {
    motifs: /(extrait.?rc|statut|procuration|mandat)/,
    type: "document_administratif",
    categorie: "administratif",
  },
];

function extraireLibelle(nom: string): string {
  const sansExt = nom.replace(/\.[a-z0-9]{1,8}$/i, "");
  return sansExt.replace(/[_-]+/g, " ").trim() || nom;
}

// Détecte une période YYYY-MM, YYYY-Qn, ou YYYY dans le nom de fichier.
function extrairePeriode(nom: string): string | null {
  const moisMatch = nom.match(/(20\d{2})[-_. ]?(0[1-9]|1[0-2])\b/);
  if (moisMatch) return `${moisMatch[1]}-${moisMatch[2]}`;
  const trimMatch = nom.match(/(20\d{2})[-_. ]?[qQ]([1-4])\b/);
  if (trimMatch) return `${trimMatch[1]}-Q${trimMatch[2]}`;
  const anneeMatch = nom.match(/\b(20\d{2})\b/);
  if (anneeMatch) return anneeMatch[1] ?? null;
  return null;
}

export const STUB_PROMPT_VERSION = "stub-classify-v1";

export class StubClassifier implements Classifier {
  readonly mode = "stub" as const;

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const start = Date.now();
    const base = `${input.nom_fichier} ${input.ocr_text ?? ""}`.toLowerCase();

    const regle = REGLES.find((r) => r.motifs.test(base));
    const periode = extrairePeriode(input.nom_fichier);
    const libelle = extraireLibelle(input.nom_fichier);

    const proposal: ClassificationProposal = regle
      ? {
          type: regle.type,
          categorie: regle.categorie,
          libelle,
          periode,
          // Bande 60-90 % → validation 1-clic (doc.md § 5.2). Le stub reste
          // volontairement prudent : jamais d'auto-classement (doc.md § 11.1).
          confiance_globale: 0.55,
          confiance_par_champ: { type: 0.55, categorie: 0.6, periode: periode ? 0.5 : 0 },
          anomalies: [],
        }
      : {
          type: "a_classer",
          categorie: "autre",
          libelle,
          periode,
          confiance_globale: 0.1,
          confiance_par_champ: { type: 0.1, categorie: 0.1, periode: periode ? 0.4 : 0 },
          anomalies: ["type_indetermine"],
        };

    return {
      proposal,
      model_used: "stub",
      prompt_version: STUB_PROMPT_VERSION,
      duration_ms: Date.now() - start,
      raw_output: { mode: "stub", matched: Boolean(regle), proposal },
    };
  }
}

export function resolveExtractionMode(value = process.env.EXTRACTION_MODE): ExtractionMode {
  return value === "live" ? "live" : "stub";
}

/**
 * Résolution cabinet-aware (ADR 0023). L'IA d'un cabinet est `live` SSI :
 *  - le kill-switch global l'autorise (`EXTRACTION_MODE=live`) — maître, court-circuit en
 *    mode stub (aucune lecture DB), ET
 *  - le flag `crm.cabinet.extraction_ia_active = true`.
 * Sinon `stub`. Utilisée par tous les chemins IA (classif, extraction, indexation, OCR).
 */
export async function resolveExtractionModeForCabinet(
  cabinet_id: string,
  envValue = process.env.EXTRACTION_MODE,
): Promise<ExtractionMode> {
  if (resolveExtractionMode(envValue) !== "live") return "stub";
  const [row] = await db
    .select({ active: cabinet.extraction_ia_active })
    .from(cabinet)
    .where(eq(cabinet.id, cabinet_id))
    .limit(1);
  return row?.active ? "live" : "stub";
}

export function getClassifier(mode: ExtractionMode = resolveExtractionMode()): Classifier {
  return mode === "live" ? new InfomaniakClassifier() : new StubClassifier();
}
