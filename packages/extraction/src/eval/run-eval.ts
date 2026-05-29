// Boucle d'évaluation partagée : applique un Classifier (stub OU live) au golden
// set et agrège les métriques. Aucune dépendance réseau propre — c'est le
// Classifier injecté qui décide s'il appelle Infomaniak ou non.

import type { Classifier } from "../classifier";
import {
  aggregate,
  type CaseEvaluation,
  type EvalMetrics,
  evaluateCase,
  formatMetrics,
} from "./evaluate";
import { GOLDEN_SET, type GoldenCase, KNOWN_TYPES, type Lang } from "./golden-set";

export interface CaseRun {
  golden: GoldenCase;
  evaluation: CaseEvaluation;
  predicted: { type: string; categorie: string; periode: string | null; confiance_globale: number };
  error?: string;
}

export interface EvalRun {
  global: EvalMetrics;
  byLang: Record<Lang, EvalMetrics>;
  runs: CaseRun[];
}

const LANGS: readonly Lang[] = ["fr", "de", "it"];

export interface RunEvalOptions {
  // Pause entre deux cas (live uniquement) pour rester sous le plafond de débit
  // RPS/RPM d'Infomaniak Beta. Défaut 0 → aucun délai (stub / CI inchangés).
  delayMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runEval(
  classifier: Classifier,
  cases: readonly GoldenCase[] = GOLDEN_SET,
  opts: RunEvalOptions = {},
): Promise<EvalRun> {
  const delayMs = opts.delayMs ?? 0;
  const sleep = opts.sleepImpl ?? defaultSleep;

  const runs: CaseRun[] = [];
  let first = true;
  for (const golden of cases) {
    if (!first && delayMs > 0) await sleep(delayMs);
    first = false;
    try {
      const { proposal } = await classifier.classify(golden.input);
      runs.push({
        golden,
        evaluation: evaluateCase(proposal, golden.expected, KNOWN_TYPES),
        predicted: {
          type: proposal.type,
          categorie: proposal.categorie,
          periode: proposal.periode,
          confiance_globale: proposal.confiance_globale,
        },
      });
    } catch (err) {
      // Un échec d'appel (live) compte comme un cas raté, sans casser tout le run.
      runs.push({
        golden,
        evaluation: {
          type_ok: false,
          categorie_ok: false,
          periode_ok: false,
          hors_vocabulaire: false,
          surconfiance: false,
        },
        predicted: { type: "<error>", categorie: "<error>", periode: null, confiance_globale: 0 },
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const byLang = {} as Record<Lang, EvalMetrics>;
  for (const lang of LANGS) {
    byLang[lang] = aggregate(runs.filter((r) => r.golden.lang === lang).map((r) => r.evaluation));
  }

  return { global: aggregate(runs.map((r) => r.evaluation)), byLang, runs };
}

// Liste lisible des cas ratés (pour la revue manuelle / le debug CI).
export function formatMisses(runs: readonly CaseRun[]): string {
  const misses = runs.filter(
    (r) => !(r.evaluation.type_ok && r.evaluation.categorie_ok && r.evaluation.periode_ok),
  );
  if (misses.length === 0) return "  (aucun écart)";
  return misses
    .map((r) => {
      const e = r.golden.expected;
      const p = r.predicted;
      const flags = [
        r.evaluation.type_ok ? null : "type",
        r.evaluation.categorie_ok ? null : "cat",
        r.evaluation.periode_ok ? null : "période",
      ]
        .filter(Boolean)
        .join("+");
      const err = r.error ? ` [ERREUR: ${r.error}]` : "";
      return (
        `  ✗ ${r.golden.id} (${r.golden.lang}) [${flags}]${err}\n` +
        `      attendu : ${e.type} / ${e.categorie} / ${e.periode ?? "—"}\n` +
        `      obtenu  : ${p.type} / ${p.categorie} / ${p.periode ?? "—"} (conf ${p.confiance_globale})`
      );
    })
    .join("\n");
}

export function formatRun(label: string, run: EvalRun): string {
  return [formatMetrics(label, run.global, run.byLang), "  écarts :", formatMisses(run.runs)].join(
    "\n",
  );
}
