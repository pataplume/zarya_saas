// Tests du matching régime TVA des templates d'échéances (P0-5, AUDIT-MVP.md §8).
//
// BUG PROD reproduit (16.07.2026) : un client avec services Comptabilité + TVA actifs et
// périodicité TVA « Trimestrielle » mais régime TVA NULL ne matchait AUCUN template TVA
// (le seed global « TVA trimestrielle (effective) » filtre regime_tva=['effective_trimestre'],
// et le matching strict `parametres->>'regime_tva' = ANY(...)` échoue en silence sur NULL)
// → 0 échéance TVA générée, sans aucun feedback. Le correctif applique un régime PAR DÉFAUT
// (méthode effective, décompte ordinaire suisse) dérivé de la périodicité du service TVA.

import { describe, expect, test } from "vitest";
import {
  regimeTvaEffectif,
  regimeTvaParDefaut,
  type ServicePourRegimeTva,
  templateMatcheRegimeTva,
} from "./regime-tva";

function svc(partial: Partial<ServicePourRegimeTva>): ServicePourRegimeTva {
  return { type: "tva", frequence: null, regime_tva: null, ...partial };
}

describe("regimeTvaParDefaut — défaut suisse (méthode effective) par périodicité", () => {
  test("mensuelle → mensuel", () => {
    expect(regimeTvaParDefaut("mensuelle")).toBe("mensuel");
  });
  test("trimestrielle → effective_trimestre", () => {
    expect(regimeTvaParDefaut("trimestrielle")).toBe("effective_trimestre");
  });
  test("semestrielle → effective_semestre", () => {
    expect(regimeTvaParDefaut("semestrielle")).toBe("effective_semestre");
  });
  test("annuelle / ponctuelle / non renseignée → aucun défaut", () => {
    expect(regimeTvaParDefaut("annuelle")).toBeNull();
    expect(regimeTvaParDefaut("ponctuelle")).toBeNull();
    expect(regimeTvaParDefaut(null)).toBeNull();
  });
});

describe("regimeTvaEffectif — régime explicite prioritaire, défaut sinon", () => {
  test("un régime explicite n'est JAMAIS écrasé par le défaut", () => {
    expect(
      regimeTvaEffectif(svc({ frequence: "trimestrielle", regime_tva: "forfaitaire_annuel" })),
    ).toBe("forfaitaire_annuel");
  });
  test("service TVA sans régime avec périodicité → défaut effectif", () => {
    expect(regimeTvaEffectif(svc({ frequence: "trimestrielle" }))).toBe("effective_trimestre");
  });
  test("service NON-TVA sans régime → pas de défaut (le défaut est réservé au service TVA)", () => {
    expect(regimeTvaEffectif(svc({ type: "comptabilite", frequence: "trimestrielle" }))).toBeNull();
  });
  test("service NON-TVA portant un régime explicite → conservé (compat matching historique)", () => {
    expect(
      regimeTvaEffectif(svc({ type: "comptabilite", regime_tva: "effective_trimestre" })),
    ).toBe("effective_trimestre");
  });
});

describe("templateMatcheRegimeTva — filtre regime_tva des templates", () => {
  test("REPRODUIT LE BUG PROD 16.07 : Comptabilité + TVA trimestrielle, régime NULL → le template « TVA trimestrielle (effective) » DOIT matcher (avant correctif : 0 échéance, en silence)", () => {
    const servicesClient = [
      svc({ type: "comptabilite", frequence: "mensuelle" }),
      svc({ type: "tva", frequence: "trimestrielle", regime_tva: null }),
    ];
    expect(templateMatcheRegimeTva(["effective_trimestre"], servicesClient)).toBe(true);
  });

  test("template sans filtre régime (NULL) → applicable à tous", () => {
    expect(templateMatcheRegimeTva(null, [])).toBe(true);
    expect(templateMatcheRegimeTva(null, [svc({ frequence: "trimestrielle" })])).toBe(true);
  });

  test("régime explicite forfaitaire → ne matche PAS un template effectif (le défaut n'écrase pas)", () => {
    const servicesClient = [svc({ frequence: "trimestrielle", regime_tva: "forfaitaire_annuel" })];
    expect(templateMatcheRegimeTva(["effective_trimestre"], servicesClient)).toBe(false);
  });

  test("TVA sans régime NI périodicité dérivable → aucun match (la complétude signale le bloquant)", () => {
    expect(templateMatcheRegimeTva(["effective_trimestre"], [svc({ frequence: null })])).toBe(
      false,
    );
    expect(templateMatcheRegimeTva(["effective_trimestre"], [svc({ frequence: "annuelle" })])).toBe(
      false,
    );
  });

  test("TVA semestrielle sans régime → matche le template semestriel (effective_semestre)", () => {
    const servicesClient = [svc({ frequence: "semestrielle" })];
    expect(
      templateMatcheRegimeTva(["effective_semestre", "forfaitaire_semestre"], servicesClient),
    ).toBe(true);
  });

  test("régime porté par un autre service actif (sémantique historique conservée)", () => {
    const servicesClient = [
      svc({ type: "comptabilite", frequence: "mensuelle", regime_tva: "effective_trimestre" }),
    ];
    expect(templateMatcheRegimeTva(["effective_trimestre"], servicesClient)).toBe(true);
  });

  test("tableau vide (≠ NULL) → ne matche rien (fidèle à `= ANY('{}')` côté SQL)", () => {
    expect(templateMatcheRegimeTva([], [svc({ frequence: "trimestrielle" })])).toBe(false);
  });

  test("aucun service actif → seul un template sans filtre matche", () => {
    expect(templateMatcheRegimeTva(["effective_trimestre"], [])).toBe(false);
  });
});
