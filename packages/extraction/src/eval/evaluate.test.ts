import { describe, expect, it } from "vitest";
import {
  aggregate,
  type CaseEvaluation,
  DEFAULT_OVERCONFIDENCE_THRESHOLD,
  evaluateCase,
  formatMetrics,
} from "./evaluate";

const KNOWN = new Set(["releve_bancaire", "facture_fournisseur", "a_classer"]);

describe("evaluateCase", () => {
  it("marque les trois champs corrects", () => {
    const ev = evaluateCase(
      {
        type: "releve_bancaire",
        categorie: "bancaire",
        periode: "2026-04",
        confiance_globale: 0.9,
      },
      { type: "releve_bancaire", categorie: "bancaire", periode: "2026-04" },
      KNOWN,
    );
    expect(ev).toEqual<CaseEvaluation>({
      type_ok: true,
      categorie_ok: true,
      periode_ok: true,
      hors_vocabulaire: false,
      surconfiance: false,
    });
  });

  it("traite période vide et null comme équivalentes", () => {
    const ev = evaluateCase(
      { type: "a_classer", categorie: "autre", periode: "  ", confiance_globale: 0.1 },
      { type: "a_classer", categorie: "autre", periode: null },
      KNOWN,
    );
    expect(ev.periode_ok).toBe(true);
  });

  it("détecte un slug hors vocabulaire (hallucination)", () => {
    const ev = evaluateCase(
      { type: "type_invente", categorie: "autre", periode: null, confiance_globale: 0.3 },
      { type: "a_classer", categorie: "autre", periode: null },
      KNOWN,
    );
    expect(ev.type_ok).toBe(false);
    expect(ev.hors_vocabulaire).toBe(true);
  });

  it("compte la sur-confiance uniquement quand le type est faux ET confiance ≥ seuil", () => {
    const faux_sur = evaluateCase(
      {
        type: "facture_fournisseur",
        categorie: "commercial",
        periode: null,
        confiance_globale: 0.95,
      },
      { type: "releve_bancaire", categorie: "bancaire", periode: null },
      KNOWN,
    );
    expect(faux_sur.surconfiance).toBe(true);

    const faux_prudent = evaluateCase(
      {
        type: "facture_fournisseur",
        categorie: "commercial",
        periode: null,
        confiance_globale: 0.5,
      },
      { type: "releve_bancaire", categorie: "bancaire", periode: null },
      KNOWN,
    );
    expect(faux_prudent.surconfiance).toBe(false);

    const juste_sur = evaluateCase(
      { type: "releve_bancaire", categorie: "bancaire", periode: null, confiance_globale: 0.99 },
      { type: "releve_bancaire", categorie: "bancaire", periode: null },
      KNOWN,
    );
    expect(juste_sur.surconfiance).toBe(false);
  });

  it("respecte un seuil de sur-confiance personnalisé", () => {
    const ev = evaluateCase(
      {
        type: "facture_fournisseur",
        categorie: "commercial",
        periode: null,
        confiance_globale: 0.6,
      },
      { type: "releve_bancaire", categorie: "bancaire", periode: null },
      KNOWN,
      0.5,
    );
    expect(ev.surconfiance).toBe(true);
    expect(DEFAULT_OVERCONFIDENCE_THRESHOLD).toBe(0.8);
  });
});

describe("aggregate", () => {
  it("renvoie des zéros sur un ensemble vide", () => {
    expect(aggregate([])).toEqual({
      total: 0,
      type_accuracy: 0,
      categorie_accuracy: 0,
      periode_accuracy: 0,
      exact_match: 0,
      hallucination_rate: 0,
      overconfidence_rate: 0,
    });
  });

  it("calcule les parts correctement", () => {
    const evals: CaseEvaluation[] = [
      {
        type_ok: true,
        categorie_ok: true,
        periode_ok: true,
        hors_vocabulaire: false,
        surconfiance: false,
      },
      {
        type_ok: false,
        categorie_ok: true,
        periode_ok: false,
        hors_vocabulaire: true,
        surconfiance: true,
      },
      {
        type_ok: true,
        categorie_ok: false,
        periode_ok: true,
        hors_vocabulaire: false,
        surconfiance: false,
      },
      {
        type_ok: true,
        categorie_ok: true,
        periode_ok: true,
        hors_vocabulaire: false,
        surconfiance: false,
      },
    ];
    const m = aggregate(evals);
    expect(m.total).toBe(4);
    expect(m.type_accuracy).toBe(0.75); // 3/4
    expect(m.categorie_accuracy).toBe(0.75); // 3/4
    expect(m.periode_accuracy).toBe(0.75); // 3/4
    expect(m.exact_match).toBe(0.5); // 2/4 (cas 1 et 4)
    expect(m.hallucination_rate).toBe(0.25); // 1/4
    expect(m.overconfidence_rate).toBe(0.25); // 1/4
  });
});

describe("formatMetrics", () => {
  it("produit un rapport lisible avec ventilation par groupe", () => {
    const base = aggregate([
      {
        type_ok: true,
        categorie_ok: true,
        periode_ok: true,
        hors_vocabulaire: false,
        surconfiance: false,
      },
    ]);
    const rapport = formatMetrics("Global", base, { fr: base });
    expect(rapport).toContain("Global (n=1)");
    expect(rapport).toContain("type");
    expect(rapport).toContain("• fr");
  });
});
