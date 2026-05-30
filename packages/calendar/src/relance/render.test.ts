import { describe, expect, it } from "vitest";
import { type RelanceVariables, renderRelance } from "./render";

const VARS: RelanceVariables = {
  client_nom: "Boulangerie Dupont SA",
  echeance_libelle: "Décompte TVA Q1",
  date_echeance: "30.04.2026",
  responsable_nom: "Marie Favre",
  cabinet_nom: "Fiduciaire Léman",
};

describe("renderRelance — interpolation Handlebars logic-less", () => {
  it("interpole toutes les variables canoniques dans l'objet et le corps", () => {
    const r = renderRelance(
      {
        objet: "Rappel — {{echeance_libelle}} pour {{client_nom}}",
        corps: "Bonjour,\n\nÉchéance au {{date_echeance}}.\n\n{{responsable_nom}}\n{{cabinet_nom}}",
      },
      VARS,
    );
    expect(r.objet).toBe("Rappel — Décompte TVA Q1 pour Boulangerie Dupont SA");
    expect(r.corps).toBe("Bonjour,\n\nÉchéance au 30.04.2026.\n\nMarie Favre\nFiduciaire Léman");
    expect(r.variables_manquantes).toEqual([]);
  });

  it("n'échappe PAS les entités HTML (relances en texte brut)", () => {
    const r = renderRelance(
      { objet: "{{client_nom}}", corps: "{{client_nom}}" },
      { ...VARS, client_nom: "Müller & Co <Sàrl>" },
    );
    expect(r.objet).toBe("Müller & Co <Sàrl>");
    expect(r.corps).toBe("Müller & Co <Sàrl>");
  });

  it("préserve le texte littéral du modèle, y compris les apostrophes", () => {
    const r = renderRelance({ objet: "L'échéance de {{client_nom}}", corps: "x" }, VARS);
    expect(r.objet).toBe("L'échéance de Boulangerie Dupont SA");
  });

  it("une variable absente rend une chaîne vide et est rapportée manquante", () => {
    const r = renderRelance({ objet: "{{client_nom}} / {{inconnue}}", corps: "ok" }, VARS);
    expect(r.objet).toBe("Boulangerie Dupont SA / ");
    expect(r.variables_manquantes).toEqual(["inconnue"]);
  });

  it("une variable fournie mais vide est considérée manquante", () => {
    const r = renderRelance(
      { objet: "{{responsable_nom}}", corps: "{{cabinet_nom}}" },
      { ...VARS, responsable_nom: "" },
    );
    expect(r.variables_manquantes).toEqual(["responsable_nom"]);
  });

  it("dédoublonne les variables manquantes référencées plusieurs fois", () => {
    const r = renderRelance(
      { objet: "{{manquante}}", corps: "{{manquante}} et {{manquante}}" },
      VARS,
    );
    expect(r.variables_manquantes).toEqual(["manquante"]);
  });

  it("un modèle sans placeholder est rendu verbatim, sans variable manquante", () => {
    const r = renderRelance({ objet: "Rappel mensuel", corps: "Merci de votre retour." }, VARS);
    expect(r.objet).toBe("Rappel mensuel");
    expect(r.corps).toBe("Merci de votre retour.");
    expect(r.variables_manquantes).toEqual([]);
  });

  it("tolère des variables supplémentaires (overrides cabinet)", () => {
    const r = renderRelance(
      { objet: "{{client_nom}} — {{montant}} CHF", corps: "ok" },
      { ...VARS, montant: 1250 },
    );
    expect(r.objet).toBe("Boulangerie Dupont SA — 1250 CHF");
    expect(r.variables_manquantes).toEqual([]);
  });

  it("ne traite pas un bloc logique comme une variable manquante", () => {
    // Les helpers de bloc (#if/#each) ne sont pas des placeholders simples :
    // ils ne doivent pas polluer variables_manquantes.
    const r = renderRelance(
      { objet: "{{client_nom}}", corps: "{{#if client_nom}}{{client_nom}}{{/if}}" },
      VARS,
    );
    expect(r.corps).toBe("Boulangerie Dupont SA");
    expect(r.variables_manquantes).toEqual([]);
  });
});
