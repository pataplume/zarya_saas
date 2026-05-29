// Garde-fou CI (déterministe, sans réseau) :
//  1. Intégrité du golden set lui-même (la « vérité terrain » doit être propre).
//  2. Baseline du StubClassifier : un plancher de qualité qui bloque les
//     régressions de l'heuristique locale (ex: une regex cassée).
//
// La qualité réelle du moteur live (Infomaniak) se mesure dans live-eval.test.ts
// (opt-in, hors CI). Ici, le stub sert de référence reproductible.

import { describe, expect, it } from "vitest";
import { StubClassifier } from "../classifier";
import { TYPES_CONNUS } from "../prompts/classification-doc";
import { GOLDEN_SET, KNOWN_TYPES } from "./golden-set";
import { formatRun, runEval } from "./run-eval";

const CATEGORIES_VALIDES = new Set([
  "bancaire",
  "fiscal",
  "salaire",
  "commercial",
  "administratif",
  "autre",
]);
const PERIODE_RE = /^(20\d{2})(-(0[1-9]|1[0-2]|Q[1-4]))?$/;

describe("golden set — intégrité de la vérité terrain", () => {
  it("contient un corpus non trivial couvrant FR/DE/IT", () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(30);
    const langs = new Set(GOLDEN_SET.map((c) => c.lang));
    expect(langs).toEqual(new Set(["fr", "de", "it"]));
  });

  it("a des identifiants uniques", () => {
    const ids = GOLDEN_SET.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("n'annote que des types et catégories valides", () => {
    for (const c of GOLDEN_SET) {
      expect(KNOWN_TYPES.has(c.expected.type), `${c.id}: type ${c.expected.type}`).toBe(true);
      expect(CATEGORIES_VALIDES.has(c.expected.categorie), `${c.id}: cat`).toBe(true);
    }
  });

  it("a des périodes au format attendu (YYYY, YYYY-MM, YYYY-Qn) ou null", () => {
    for (const c of GOLDEN_SET) {
      if (c.expected.periode !== null) {
        expect(PERIODE_RE.test(c.expected.periode), `${c.id}: ${c.expected.periode}`).toBe(true);
      }
    }
  });

  it("couvre l'ensemble du vocabulaire de types", () => {
    const couverts = new Set(GOLDEN_SET.map((c) => c.expected.type));
    for (const t of TYPES_CONNUS) {
      expect(couverts.has(t), `type non couvert par le golden set : ${t}`).toBe(true);
    }
  });
});

describe("StubClassifier — baseline (garde-fou de non-régression)", () => {
  it("atteint les planchers de qualité attendus sur le golden set", async () => {
    const run = await runEval(new StubClassifier());

    // Rapport imprimé pour inspection (visible avec le reporter verbose).
    // biome-ignore lint/suspicious/noConsole: sortie volontaire du harnais d'éval.
    console.log(`\n${formatRun("Stub / golden set", run)}\n`);

    expect(run.global.total).toBe(GOLDEN_SET.length);

    // Planchers conservateurs, fixés SOUS la baseline mesurée (~50 % type / ~54 %
    // cat sur 56 cas) pour absorber l'ajout futur de cas durs sans casser : ils
    // bloquent une régression franche (regex cassée), pas un drift de quelques %.
    expect(run.global.type_accuracy).toBeGreaterThanOrEqual(0.45);
    expect(run.global.categorie_accuracy).toBeGreaterThanOrEqual(0.45);

    // Le stub n'émet que des slugs connus et plafonne sa confiance à 0.55 :
    // jamais d'hallucination de slug ni de sur-confiance. Invariants forts.
    expect(run.global.hallucination_rate).toBe(0);
    expect(run.global.overconfidence_rate).toBe(0);

    // Le FR (langue des regex) doit rester nettement mieux classé que le global
    // (baseline ~80 %) — plancher à 0.7 pour la même marge anti-faux-positif.
    expect(run.byLang.fr.type_accuracy).toBeGreaterThanOrEqual(0.7);
  });
});
