/**
 * Lot 3 (ADR 0025) — Assistant de complétude du dossier client (cœur PUR).
 *
 * Vérifie le score + la checklist « ce qui manque pour activer tel service », en particulier
 * les BLOQUANTS de génération d'échéances (régime TVA, date de bouclement, jour de validation
 * salaire, canton fiscal). Parcours non bloquant : la lib n'est qu'un indicateur.
 */
import { describe, expect, it } from "vitest";
import { type CompletudeInput, calculerCompletude } from "../../apps/web/lib/completude-client";

// Base minimale « dossier vide » : aucune donnée, aucun service.
function vide(): CompletudeInput {
  return {
    identite: { raison_sociale: "Acme SA", type: null, ide: null },
    nb_contacts: 0,
    a_contact_principal: false,
    a_adresse_avec_canton: false,
    nb_adresses: 0,
    services: [],
    param_comptable: null,
    salaire_config: null,
  };
}

describe("calculerCompletude — recommandations transverses", () => {
  it("dossier vide : aucun bloquant, mais des recommandations (type, IDE, contact, adresse)", () => {
    const r = calculerCompletude(vide());
    expect(r.a_bloquants).toBe(false);
    const cles = r.manquants.map((m) => m.cle);
    expect(cles).toEqual(
      expect.arrayContaining([
        "identite.type",
        "identite.ide",
        "contacts.au_moins_un",
        "adresses.au_moins_une",
      ]),
    );
    expect(r.manquants.every((m) => m.severite === "recommande")).toBe(true);
  });

  it("dossier complet sans service : score 100 et rien ne manque", () => {
    const input: CompletudeInput = {
      identite: { raison_sociale: "Acme SA", type: "pme", ide: "CHE-123.456.789" },
      nb_contacts: 1,
      a_contact_principal: true,
      a_adresse_avec_canton: true,
      nb_adresses: 1,
      services: [],
      param_comptable: null,
      salaire_config: null,
    };
    const r = calculerCompletude(input);
    expect(r.score).toBe(100);
    expect(r.manquants).toHaveLength(0);
  });

  it("contact principal n'est demandé que s'il existe au moins un contact", () => {
    const r0 = calculerCompletude(vide());
    expect(r0.manquants.map((m) => m.cle)).not.toContain("contacts.principal");

    const r1 = calculerCompletude({ ...vide(), nb_contacts: 1, a_contact_principal: false });
    expect(r1.manquants.map((m) => m.cle)).toContain("contacts.principal");
  });
});

describe("calculerCompletude — bloquants de génération d'échéances", () => {
  it("service TVA sans régime avec périodicité dérivable → RECOMMANDÉ (défaut effectif du moteur, P0-5)", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "tva", frequence: "trimestrielle", regime_tva: null }],
    });
    const item = r.manquants.find((m) => m.cle === "service.tva.regime");
    expect(item?.severite).toBe("recommande");
    expect(item?.service).toBe("tva");
    expect(r.a_bloquants).toBe(false);
  });

  it("service TVA sans régime NI périodicité dérivable → bloquant 'service.tva.regime'", () => {
    for (const frequence of [null, "annuelle", "ponctuelle"]) {
      const r = calculerCompletude({
        ...vide(),
        services: [{ type: "tva", frequence, regime_tva: null }],
      });
      const item = r.manquants.find((m) => m.cle === "service.tva.regime");
      expect(item?.severite).toBe("bloquant");
      expect(r.a_bloquants).toBe(true);
    }
  });

  it("service TVA avec régime → plus de bloquant TVA", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "tva", frequence: "trimestrielle", regime_tva: "effective_trimestre" }],
    });
    expect(r.manquants.map((m) => m.cle)).not.toContain("service.tva.regime");
  });

  it("service bouclement sans date_bouclement → bloquant", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "bouclement", frequence: "annuelle", regime_tva: null }],
      param_comptable: { date_bouclement: null },
    });
    expect(r.manquants.find((m) => m.cle === "service.bouclement.date")?.severite).toBe("bloquant");

    const ok = calculerCompletude({
      ...vide(),
      services: [{ type: "bouclement", frequence: "annuelle", regime_tva: null }],
      param_comptable: { date_bouclement: "2025-12-31" },
    });
    expect(ok.manquants.map((m) => m.cle)).not.toContain("service.bouclement.date");
  });

  it("service salaires sans jour de validation → bloquant", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "salaires", frequence: "mensuelle", regime_tva: null }],
      salaire_config: { frequence_paie: "mensuelle", date_validation_jour_du_mois: null },
    });
    expect(r.manquants.find((m) => m.cle === "service.salaires.jour_validation")?.severite).toBe(
      "bloquant",
    );

    const ok = calculerCompletude({
      ...vide(),
      services: [{ type: "salaires", frequence: "mensuelle", regime_tva: null }],
      salaire_config: { frequence_paie: "mensuelle", date_validation_jour_du_mois: 25 },
    });
    expect(ok.manquants.map((m) => m.cle)).not.toContain("service.salaires.jour_validation");
  });

  it("service fiscalité sans adresse avec canton → bloquant 'service.fiscalite.canton'", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "fiscalite", frequence: "annuelle", regime_tva: null }],
      a_adresse_avec_canton: false,
    });
    expect(r.manquants.find((m) => m.cle === "service.fiscalite.canton")?.severite).toBe(
      "bloquant",
    );

    const ok = calculerCompletude({
      ...vide(),
      services: [{ type: "fiscalite", frequence: "annuelle", regime_tva: null }],
      a_adresse_avec_canton: true,
      nb_adresses: 1,
    });
    expect(ok.manquants.map((m) => m.cle)).not.toContain("service.fiscalite.canton");
  });

  it("comptabilité (sans prérequis bloquant) → aucun bloquant ajouté pour ce service", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "comptabilite", frequence: "mensuelle", regime_tva: null }],
    });
    expect(r.a_bloquants).toBe(false);
  });
});

describe("calculerCompletude — score et ordre", () => {
  it("fréquence de service manquante = recommandé, pas bloquant", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "comptabilite", frequence: null, regime_tva: null }],
    });
    const item = r.manquants.find((m) => m.cle === "service.comptabilite.frequence");
    expect(item?.severite).toBe("recommande");
  });

  it("les bloquants sont triés avant les recommandés", () => {
    const r = calculerCompletude({
      ...vide(),
      services: [{ type: "tva", frequence: null, regime_tva: null }],
    });
    const idxBloquant = r.manquants.findIndex((m) => m.severite === "bloquant");
    const idxRecommande = r.manquants.findIndex((m) => m.severite === "recommande");
    expect(idxBloquant).toBeGreaterThanOrEqual(0);
    expect(idxRecommande).toBeGreaterThan(idxBloquant);
  });

  it("score décroît quand des prérequis manquent (bornes 0..100)", () => {
    const partiel = calculerCompletude({
      ...vide(),
      services: [{ type: "tva", frequence: "trimestrielle", regime_tva: null }],
    });
    expect(partiel.score).toBeGreaterThanOrEqual(0);
    expect(partiel.score).toBeLessThan(100);
  });
});
