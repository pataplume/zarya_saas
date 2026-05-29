// Évaluation LIVE contre Infomaniak — OPT-IN, jamais en CI.
//
// Objectif : revue manuelle de la qualité réelle du classifier sur le golden set
// (précision par champ, par langue, écarts détaillés, sur-confiance). Coûte des
// tokens et appelle le réseau → garde derrière RUN_LIVE_EVAL=1.
//
// Lancer :
//   RUN_LIVE_EVAL=1 EXTRACTION_MODE=live pnpm vitest run \
//     packages/extraction/src/eval/live-eval.test.ts
//
// Pré-requis : IK_PRODUCT_ID, IK_API_TOKEN, IK_MODEL_CHAT_SMALL dans .env.local
// (chargé par tests/setup.ts).

import { describe, expect, it } from "vitest";
import { InfomaniakClassifier } from "../infomaniak-classifier";
import { GOLDEN_SET } from "./golden-set";
import { formatRun, runEval } from "./run-eval";

const RUN_LIVE = process.env.RUN_LIVE_EVAL === "1";

describe.runIf(RUN_LIVE)("Infomaniak (live) — revue manuelle golden set", () => {
  it("classe l'ensemble du golden set et imprime un rapport de qualité", {
    timeout: 600_000,
  }, async () => {
    const run = await runEval(new InfomaniakClassifier());

    // Rapport principal destiné à l'œil humain (revue manuelle).
    // biome-ignore lint/suspicious/noConsole: sortie volontaire du harnais d'éval.
    console.log(`\n${formatRun("Infomaniak / golden set (LIVE)", run)}\n`);

    // Tous les cas ont bien été traités (les erreurs réseau comptent comme ratés
    // mais n'interrompent pas le run — cf. runEval).
    expect(run.global.total).toBe(GOLDEN_SET.length);

    // Garde-fou « smoke » uniquement : le live doit faire au moins aussi bien
    // qu'une heuristique naïve. Le vrai jugement de qualité reste la lecture du
    // rapport ci-dessus (à confronter aux seuils visés dans extraction/CLAUDE.md).
    expect(run.global.type_accuracy).toBeGreaterThanOrEqual(0.5);
  });
});
