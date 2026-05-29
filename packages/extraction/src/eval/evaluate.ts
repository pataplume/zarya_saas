// Harnais d'évaluation du classifier documentaire (tâche #29).
//
// 100 % pur (aucun I/O, aucun appel réseau) : la même logique sert
//  - au garde-fou CI sur le StubClassifier (déterministe, golden-set.test.ts),
//  - à la revue manuelle live sur Infomaniak (live-eval.test.ts).
//
// On compare une proposition (sous-ensemble de ClassificationProposal) à une
// vérité terrain annotée, par champ, et on agrège des métriques de qualité.

import type { CategorieDocument } from "../classifier";

export interface ExpectedClassification {
  type: string;
  categorie: CategorieDocument;
  periode: string | null;
}

// Ce dont l'évaluateur a besoin d'une proposition (compatible ClassificationProposal).
export interface EvaluatedProposal {
  type: string;
  categorie: CategorieDocument;
  periode: string | null;
  confiance_globale: number;
}

export interface CaseEvaluation {
  type_ok: boolean;
  categorie_ok: boolean;
  periode_ok: boolean;
  // type proposé absent du vocabulaire connu = hallucination de slug.
  hors_vocabulaire: boolean;
  // confiance élevée alors que le type est faux = sur-confiance (le pire cas).
  surconfiance: boolean;
}

// Au-delà de ce seuil, une erreur de type est comptée comme « sur-confiante ».
export const DEFAULT_OVERCONFIDENCE_THRESHOLD = 0.8;

function normPeriode(p: string | null | undefined): string | null {
  return typeof p === "string" && p.trim() !== "" ? p.trim() : null;
}

export function evaluateCase(
  proposal: EvaluatedProposal,
  expected: ExpectedClassification,
  knownTypes: ReadonlySet<string>,
  overconfidenceThreshold = DEFAULT_OVERCONFIDENCE_THRESHOLD,
): CaseEvaluation {
  const type_ok = proposal.type === expected.type;
  return {
    type_ok,
    categorie_ok: proposal.categorie === expected.categorie,
    periode_ok: normPeriode(proposal.periode) === normPeriode(expected.periode),
    hors_vocabulaire: !knownTypes.has(proposal.type),
    surconfiance: !type_ok && proposal.confiance_globale >= overconfidenceThreshold,
  };
}

export interface EvalMetrics {
  total: number;
  type_accuracy: number;
  categorie_accuracy: number;
  periode_accuracy: number;
  exact_match: number; // les trois champs corrects
  hallucination_rate: number;
  overconfidence_rate: number;
}

export function aggregate(evals: readonly CaseEvaluation[]): EvalMetrics {
  const total = evals.length;
  if (total === 0) {
    return {
      total: 0,
      type_accuracy: 0,
      categorie_accuracy: 0,
      periode_accuracy: 0,
      exact_match: 0,
      hallucination_rate: 0,
      overconfidence_rate: 0,
    };
  }
  let type = 0;
  let categorie = 0;
  let periode = 0;
  let exact = 0;
  let hallu = 0;
  let over = 0;
  for (const e of evals) {
    if (e.type_ok) type += 1;
    if (e.categorie_ok) categorie += 1;
    if (e.periode_ok) periode += 1;
    if (e.type_ok && e.categorie_ok && e.periode_ok) exact += 1;
    if (e.hors_vocabulaire) hallu += 1;
    if (e.surconfiance) over += 1;
  }
  return {
    total,
    type_accuracy: type / total,
    categorie_accuracy: categorie / total,
    periode_accuracy: periode / total,
    exact_match: exact / total,
    hallucination_rate: hallu / total,
    overconfidence_rate: over / total,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Rapport texte lisible (revue manuelle). `groups` = métriques par sous-ensemble (ex: langue).
export function formatMetrics(
  label: string,
  metrics: EvalMetrics,
  groups?: Record<string, EvalMetrics>,
): string {
  const lines = [
    `── ${label} (n=${metrics.total}) ──`,
    `  type        : ${pct(metrics.type_accuracy)}`,
    `  catégorie   : ${pct(metrics.categorie_accuracy)}`,
    `  période     : ${pct(metrics.periode_accuracy)}`,
    `  exact-match : ${pct(metrics.exact_match)}`,
    `  hallucination (slug hors vocabulaire) : ${pct(metrics.hallucination_rate)}`,
    `  sur-confiance (faux mais sûr)         : ${pct(metrics.overconfidence_rate)}`,
  ];
  if (groups) {
    for (const [name, m] of Object.entries(groups)) {
      lines.push(
        `  • ${name.padEnd(4)} n=${m.total} | type ${pct(m.type_accuracy)} | cat ${pct(
          m.categorie_accuracy,
        )} | période ${pct(m.periode_accuracy)} | exact ${pct(m.exact_match)}`,
      );
    }
  }
  return lines.join("\n");
}
