/**
 * RUN 7 usabilité — logique pure de la grille-mois du calendrier (`apps/web/lib/
 * calendrier-grille.ts`). Couvre le calcul des jours de la grille (débordement semaine
 * précédente/suivante), le regroupement par jour, et le parsing défensif de `?mois=`.
 */
import { describe, expect, it } from "vitest";
import {
  dernierJourMois,
  formatMoisParam,
  joursGrilleMois,
  libelleMois,
  moisAdjacent,
  parseMoisParam,
  premierJourMois,
  regrouperParJour,
} from "../../apps/web/lib/calendrier-grille";

describe("parseMoisParam", () => {
  it("parse un ?mois=AAAA-MM valide", () => {
    expect(parseMoisParam("2026-07")).toEqual({ annee: 2026, mois: 7 });
  });

  it("retombe sur le mois courant si absent", () => {
    const maintenant = new Date(Date.UTC(2026, 6, 15)); // juillet 2026
    expect(parseMoisParam(undefined, maintenant)).toEqual({ annee: 2026, mois: 7 });
  });

  it("retombe sur le mois courant si format invalide (jamais d'exception)", () => {
    const maintenant = new Date(Date.UTC(2026, 6, 15));
    expect(parseMoisParam("pas-une-date", maintenant)).toEqual({ annee: 2026, mois: 7 });
    expect(parseMoisParam("2026-13", maintenant)).toEqual({ annee: 2026, mois: 7 });
    expect(parseMoisParam("2026-00", maintenant)).toEqual({ annee: 2026, mois: 7 });
  });
});

describe("formatMoisParam / moisAdjacent", () => {
  it("sérialise avec zéro-padding", () => {
    expect(formatMoisParam(2026, 7)).toBe("2026-07");
    expect(formatMoisParam(2026, 1)).toBe("2026-01");
  });

  it("calcule le mois suivant avec débordement d'année", () => {
    expect(moisAdjacent(2026, 12, 1)).toEqual({ annee: 2027, mois: 1 });
  });

  it("calcule le mois précédent avec débordement d'année", () => {
    expect(moisAdjacent(2026, 1, -1)).toEqual({ annee: 2025, mois: 12 });
  });

  it("calcule le mois adjacent au sein de la même année", () => {
    expect(moisAdjacent(2026, 7, 1)).toEqual({ annee: 2026, mois: 8 });
    expect(moisAdjacent(2026, 7, -1)).toEqual({ annee: 2026, mois: 6 });
  });
});

describe("libelleMois", () => {
  it("formatte en FR", () => {
    expect(libelleMois(2026, 7)).toBe("Juillet 2026");
    expect(libelleMois(2026, 1)).toBe("Janvier 2026");
    expect(libelleMois(2026, 12)).toBe("Décembre 2026");
  });
});

describe("premierJourMois / dernierJourMois", () => {
  it("bornes correctes pour un mois de 31 jours", () => {
    expect(premierJourMois(2026, 7)).toBe("2026-07-01");
    expect(dernierJourMois(2026, 7)).toBe("2026-07-31");
  });

  it("bornes correctes pour février (année non bissextile)", () => {
    expect(premierJourMois(2026, 2)).toBe("2026-02-01");
    expect(dernierJourMois(2026, 2)).toBe("2026-02-28");
  });

  it("bornes correctes pour février (année bissextile)", () => {
    expect(dernierJourMois(2024, 2)).toBe("2024-02-29");
  });
});

describe("joursGrilleMois", () => {
  it("commence un lundi et finit un dimanche, longueur multiple de 7", () => {
    const jours = joursGrilleMois(2026, 7);
    expect(jours.length % 7).toBe(0);
    const premier = new Date(`${jours[0]?.iso}T00:00:00Z`);
    const dernier = new Date(`${jours[jours.length - 1]?.iso}T00:00:00Z`);
    expect(premier.getUTCDay()).toBe(1); // lundi
    expect(dernier.getUTCDay()).toBe(0); // dimanche
  });

  it("juillet 2026 : le 1er tombe un mercredi -> débordement de juin inclus", () => {
    const jours = joursGrilleMois(2026, 7);
    // Le 1er juillet 2026 est un mercredi -> lundi 2026-06-29 est le début de grille.
    expect(jours[0]?.iso).toBe("2026-06-29");
    expect(jours[0]?.dansLeMois).toBe(false);
    const premierJuillet = jours.find((j) => j.iso === "2026-07-01");
    expect(premierJuillet?.dansLeMois).toBe(true);
    expect(premierJuillet?.jour).toBe(1);
  });

  it("marque aujourdhui correctement", () => {
    const jours = joursGrilleMois(2026, 7, "2026-07-15");
    const jour15 = jours.find((j) => j.iso === "2026-07-15");
    expect(jour15?.aujourdhui).toBe(true);
    const jour16 = jours.find((j) => j.iso === "2026-07-16");
    expect(jour16?.aujourdhui).toBe(false);
  });

  it("un mois complet couvre tous les jours du mois", () => {
    const jours = joursGrilleMois(2026, 7);
    const joursDuMois = jours.filter((j) => j.dansLeMois);
    expect(joursDuMois).toHaveLength(31);
  });
});

describe("regrouperParJour", () => {
  it("regroupe plusieurs échéances du même jour", () => {
    const parJour = regrouperParJour([
      { date_echeance: "2026-07-15", id: "a" },
      { date_echeance: "2026-07-15", id: "b" },
      { date_echeance: "2026-07-16", id: "c" },
    ]);
    expect(parJour["2026-07-15"]).toHaveLength(2);
    expect(parJour["2026-07-16"]).toHaveLength(1);
    expect(parJour["2026-07-17"]).toBeUndefined();
  });

  it("ignore les échéances sans date plutôt que de planter", () => {
    const parJour = regrouperParJour([
      { date_echeance: null, id: "a" },
      { date_echeance: "2026-07-15", id: "b" },
    ]);
    expect(Object.keys(parJour)).toEqual(["2026-07-15"]);
  });

  it("renvoie un objet vide pour une liste vide", () => {
    expect(regrouperParJour([])).toEqual({});
  });
});
