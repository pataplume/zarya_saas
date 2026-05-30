import { describe, expect, test } from "vitest";
import {
  BAREME_RISQUE_VERSION,
  computeScoreRisque,
  type RisqueSignals,
  SEUIL_RISQUE_CRITIQUE,
} from "./compute-risque";

function sig(over: Partial<RisqueSignals>): RisqueSignals {
  return {
    nb_echeances_en_retard: 0,
    nb_documents_en_retard: 0,
    nb_documents_manquants: 0,
    ...over,
  };
}

describe("computeScoreRisque (barème v1, ADR 0015)", () => {
  test("aucun signal → score 0, niveau ok, pas de drapeau ni motif", () => {
    const r = computeScoreRisque(sig({}));
    expect(r.score).toBe(0);
    expect(r.niveau).toBe("ok");
    expect(r.drapeau_critique).toBe(false);
    expect(r.drapeau_motif).toBeNull();
  });

  test("pondération additive : 25·éch + 20·doc_retard + 10·doc_manquant", () => {
    expect(computeScoreRisque(sig({ nb_echeances_en_retard: 1 })).score).toBe(25);
    expect(computeScoreRisque(sig({ nb_documents_en_retard: 1 })).score).toBe(20);
    expect(computeScoreRisque(sig({ nb_documents_manquants: 1 })).score).toBe(10);
    expect(
      computeScoreRisque(sig({ nb_echeances_en_retard: 1, nb_documents_manquants: 2 })).score,
    ).toBe(45);
  });

  test("score plafonné à 100", () => {
    const r = computeScoreRisque(sig({ nb_echeances_en_retard: 10 }));
    expect(r.score).toBe(100);
  });

  describe("seuils de niveau", () => {
    test("score 0 → ok", () => {
      expect(computeScoreRisque(sig({})).niveau).toBe("ok");
    });
    test("score > 0 et < 50 → surveillance", () => {
      expect(computeScoreRisque(sig({ nb_documents_manquants: 1 })).niveau).toBe("surveillance"); // 10
      expect(computeScoreRisque(sig({ nb_documents_en_retard: 1 })).niveau).toBe("surveillance"); // 20
      expect(computeScoreRisque(sig({ nb_echeances_en_retard: 1 })).niveau).toBe("surveillance"); // 25
    });
    test("score pile au seuil (50) → critique", () => {
      const r = computeScoreRisque(sig({ nb_echeances_en_retard: 2 })); // 50
      expect(r.score).toBe(SEUIL_RISQUE_CRITIQUE);
      expect(r.niveau).toBe("critique");
      expect(r.drapeau_critique).toBe(true);
    });
  });

  test("drapeau critique → motif FR listant les signaux non nuls (·-séparés)", () => {
    const r = computeScoreRisque(
      sig({ nb_echeances_en_retard: 2, nb_documents_en_retard: 1 }), // 50 + 20 = 70 → critique
    );
    expect(r.drapeau_critique).toBe(true);
    expect(r.drapeau_motif).toBe("2 échéance(s) en retard · 1 document(s) en retard");
  });

  test("niveau surveillance → pas de motif (le motif explique le drapeau critique seul)", () => {
    const r = computeScoreRisque(sig({ nb_documents_en_retard: 1 })); // 20 → surveillance
    expect(r.drapeau_motif).toBeNull();
  });

  test("facteurs trace la version + le détail + l'horodatage injecté", () => {
    const now = new Date("2026-04-15T10:00:00.000Z");
    const r = computeScoreRisque(
      sig({ nb_echeances_en_retard: 1, nb_documents_en_retard: 2, nb_documents_manquants: 3 }),
      now,
    );
    expect(r.facteurs).toEqual({
      version: BAREME_RISQUE_VERSION,
      nb_echeances_en_retard: 1,
      nb_documents_en_retard: 2,
      nb_documents_manquants: 3,
      score: r.score,
      niveau: r.niveau,
      calcule_le: "2026-04-15T10:00:00.000Z",
    });
  });
});
