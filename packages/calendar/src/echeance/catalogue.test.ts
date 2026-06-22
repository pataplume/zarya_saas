// Tests du cœur PUR du moteur d'échéances (Lot 2 — ADR 0025 / ADR 0011 Run 6).
// Couvre le Catalogue V1 (PLAN-ONBOARDING-CLIENT Annexe) : TVA trimestrielle (Q1-Q4),
// TVA semestrielle, bouclement annuel, salaire mensuel + bornes de date (jour_du_mois
// NULL → fin de mois, année bissextile, alerte = échéance − N, horizon, ponctuelle).

import { describe, expect, test } from "vitest";
import { calculerOccurrences, dernierJourDuMois, horizonEnd, type TemplateRule } from "./catalogue";

function rule(partial: Partial<TemplateRule>): TemplateRule {
  return {
    template_id: "tpl-1",
    nom: "Échéance",
    type_echeance: "tva",
    frequence: "trimestrielle",
    mois_dans_annee: null,
    jour_du_mois: null,
    date_specifique: null,
    delai_alerte_jours: 14,
    ...partial,
  };
}

function dates(occ: ReturnType<typeof calculerOccurrences>): string[] {
  return occ.map((o) => o.date_echeance);
}

describe("dernierJourDuMois", () => {
  test("février non bissextile = 28", () => {
    expect(dernierJourDuMois(2026, 2)).toBe(28);
  });
  test("février bissextile = 29", () => {
    expect(dernierJourDuMois(2028, 2)).toBe(29);
  });
  test("avril = 30, décembre = 31", () => {
    expect(dernierJourDuMois(2026, 4)).toBe(30);
    expect(dernierJourDuMois(2026, 12)).toBe(31);
  });
});

describe("horizonEnd", () => {
  test("today + 12 mois = dernier jour du mois cible", () => {
    // janvier 2026 + 12 mois = janvier 2027 → 31.01.2027
    expect(horizonEnd("2026-01-05", 12)).toBe("2027-01-31");
  });
  test("franchit l'année et borne en fin de mois (février)", () => {
    // décembre 2025 + 2 mois = février 2026 → 28.02.2026
    expect(horizonEnd("2025-12-10", 2)).toBe("2026-02-28");
  });
});

describe("calculerOccurrences — TVA trimestrielle (Q1-Q4)", () => {
  // Catalogue V1 : décompte TVA trimestriel, dépôt le dernier jour du 2e mois après le
  // trimestre. Le seed fédéral encode cela par mois_dans_annee [2,5,8,11] (fin de mois).
  const tvaTrim = rule({
    nom: "TVA trimestrielle (effective)",
    frequence: "trimestrielle",
    mois_dans_annee: [2, 5, 8, 11],
    jour_du_mois: null, // dernier jour du mois
    delai_alerte_jours: 14,
  });

  test("les 4 trimestres sur 12 mois tombent fin février/mai/août/novembre", () => {
    const occ = calculerOccurrences(tvaTrim, "2026-01-05", 12);
    expect(dates(occ)).toEqual(["2026-02-28", "2026-05-31", "2026-08-31", "2026-11-30"]);
  });

  test("date_alerte = échéance − 14 jours", () => {
    const occ = calculerOccurrences(tvaTrim, "2026-01-05", 3);
    expect(occ[0]?.date_echeance).toBe("2026-02-28");
    expect(occ[0]?.date_alerte).toBe("2026-02-14");
  });

  test("libellé = nom (MM.YYYY)", () => {
    const occ = calculerOccurrences(tvaTrim, "2026-01-05", 3);
    expect(occ[0]?.libelle).toBe("TVA trimestrielle (effective) (02.2026)");
  });
});

describe("calculerOccurrences — TVA semestrielle (S1, S2)", () => {
  // Catalogue V1 : S1 → 31.08, S2 → fin février. Seed fédéral : mois_dans_annee [2, 8].
  const tvaSem = rule({
    nom: "TVA semestrielle",
    frequence: "semestrielle",
    mois_dans_annee: [2, 8],
    jour_du_mois: null,
  });

  test("2 occurrences par an (fin février, fin août)", () => {
    const occ = calculerOccurrences(tvaSem, "2026-01-05", 12);
    expect(dates(occ)).toEqual(["2026-02-28", "2026-08-31"]);
  });
});

describe("calculerOccurrences — bouclement annuel", () => {
  // Catalogue V1 : bouclement = 1/an. Seed fédéral : annuelle, mois_dans_annee [3].
  const bouclement = rule({
    nom: "Bouclement annuel",
    type_echeance: "bouclement",
    frequence: "annuelle",
    mois_dans_annee: [3],
    jour_du_mois: null,
    delai_alerte_jours: 30,
  });

  test("une seule occurrence dans l'horizon (mars)", () => {
    const occ = calculerOccurrences(bouclement, "2026-01-05", 12);
    expect(dates(occ)).toEqual(["2026-03-31"]);
    expect(occ[0]?.date_alerte).toBe("2026-03-01"); // 31 − 30 jours
  });

  test("type fiscale/bouclement propagé sur l'occurrence", () => {
    const occ = calculerOccurrences(bouclement, "2026-01-05", 12);
    expect(occ[0]?.type_echeance).toBe("bouclement");
  });
});

describe("calculerOccurrences — salaire mensuel", () => {
  // Catalogue V1 : validation salaire mensuelle, jour configuré (seed = 25).
  const salaire = rule({
    nom: "Validation salaire mensuel",
    type_echeance: "salaire",
    frequence: "mensuelle",
    mois_dans_annee: null,
    jour_du_mois: 25,
    delai_alerte_jours: 7,
  });

  test("une occurrence par mois de l'horizon, le 25", () => {
    const occ = calculerOccurrences(salaire, "2026-03-10", 3);
    // mars→juin ; le 25 juin (> 1er juin de l'horizon-end inclus jusqu'à fin juin) inclus.
    expect(dates(occ)).toEqual(["2026-03-25", "2026-04-25", "2026-05-25", "2026-06-25"]);
    expect(occ[0]?.date_alerte).toBe("2026-03-18");
  });

  test("le jour déjà passé du mois courant est exclu (≥ today)", () => {
    // today = 26 mars → le 25 mars est passé, première occurrence = 25 avril.
    const occ = calculerOccurrences(salaire, "2026-03-26", 2);
    expect(dates(occ)).toEqual(["2026-04-25", "2026-05-25"]);
  });
});

describe("calculerOccurrences — bornes de date", () => {
  test("jour_du_mois NULL → dernier jour du mois (février non bissextile)", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "annuelle", mois_dans_annee: [2], jour_du_mois: null }),
      "2026-01-05",
      3,
    );
    expect(dates(occ)).toEqual(["2026-02-28"]);
  });

  test("jour_du_mois 31 borné au dernier jour d'un mois court (avril → 30)", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "annuelle", mois_dans_annee: [4], jour_du_mois: 31 }),
      "2026-01-05",
      6,
    );
    expect(dates(occ)).toEqual(["2026-04-30"]);
  });

  test("année bissextile : 29 février 2028", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "annuelle", mois_dans_annee: [2], jour_du_mois: null }),
      "2028-01-05",
      3,
    );
    expect(dates(occ)).toEqual(["2028-02-29"]);
  });
});

describe("calculerOccurrences — ponctuelle / evenement", () => {
  test("ponctuelle : une occurrence si date_specifique dans l'horizon", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "ponctuelle", date_specifique: "2026-04-15" }),
      "2026-01-05",
      6,
    );
    expect(dates(occ)).toEqual(["2026-04-15"]);
  });

  test("ponctuelle hors horizon → aucune occurrence", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "ponctuelle", date_specifique: "2027-04-15" }),
      "2026-01-05",
      6,
    );
    expect(occ).toHaveLength(0);
  });

  test("ponctuelle sans date_specifique → aucune occurrence", () => {
    const occ = calculerOccurrences(
      rule({ frequence: "ponctuelle", date_specifique: null }),
      "2026-01-05",
      6,
    );
    expect(occ).toHaveLength(0);
  });
});
