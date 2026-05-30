import { describe, expect, test } from "vitest";
import {
  type AutoClassementSignals,
  decideAutoClassement,
  SEUIL_AUTO_AGGRESSIVE,
  SEUIL_AUTO_HYBRIDE,
} from "./decide-auto-classement";

function sig(over: Partial<AutoClassementSignals>): AutoClassementSignals {
  return {
    politique: "strict",
    confiance_globale: 0.99,
    nb_anomalies: 0,
    has_client: true,
    ...over,
  };
}

describe("decideAutoClassement", () => {
  test("strict ne déclenche jamais l'auto, même à 1.0 sans anomalie", () => {
    expect(decideAutoClassement(sig({ politique: "strict", confiance_globale: 1 }))).toBe(false);
  });

  test("auto exige toujours un client rattaché (même hybride/aggressive très confiant)", () => {
    expect(
      decideAutoClassement(sig({ politique: "hybride", confiance_globale: 1, has_client: false })),
    ).toBe(false);
    expect(
      decideAutoClassement(
        sig({ politique: "aggressive", confiance_globale: 1, has_client: false }),
      ),
    ).toBe(false);
  });

  describe("hybride : > 0.95 ET aucune anomalie", () => {
    test("au-dessus du seuil, sans anomalie → auto", () => {
      expect(decideAutoClassement(sig({ politique: "hybride", confiance_globale: 0.96 }))).toBe(
        true,
      );
    });
    test("pile au seuil (0.95) → file (strictement supérieur)", () => {
      expect(
        decideAutoClassement(sig({ politique: "hybride", confiance_globale: SEUIL_AUTO_HYBRIDE })),
      ).toBe(false);
    });
    test("au-dessus du seuil mais avec anomalie → file", () => {
      expect(
        decideAutoClassement(
          sig({ politique: "hybride", confiance_globale: 0.99, nb_anomalies: 1 }),
        ),
      ).toBe(false);
    });
  });

  describe("aggressive : > 0.80 (anomalies ignorées)", () => {
    test("au-dessus du seuil → auto même avec anomalie", () => {
      expect(
        decideAutoClassement(
          sig({ politique: "aggressive", confiance_globale: 0.81, nb_anomalies: 3 }),
        ),
      ).toBe(true);
    });
    test("pile au seuil (0.80) → file", () => {
      expect(
        decideAutoClassement(
          sig({ politique: "aggressive", confiance_globale: SEUIL_AUTO_AGGRESSIVE }),
        ),
      ).toBe(false);
    });
    test("sous le seuil → file", () => {
      expect(decideAutoClassement(sig({ politique: "aggressive", confiance_globale: 0.79 }))).toBe(
        false,
      );
    });
  });
});
