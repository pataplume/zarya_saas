// G2 — cœur pur des dates de génération de période.
import { describe, expect, it } from "vitest";
import { deriverDateLimite, joursDansMois, moisPrecedent } from "./generer-periodes";

describe("moisPrecedent", () => {
  it("recule d'un mois et gère le passage d'année", () => {
    expect(moisPrecedent(2026, 5)).toEqual({ annee: 2026, mois: 4 });
    expect(moisPrecedent(2026, 1)).toEqual({ annee: 2025, mois: 12 });
  });
});

describe("joursDansMois", () => {
  it("gère février et les bissextiles", () => {
    expect(joursDansMois(2026, 2)).toBe(28);
    expect(joursDansMois(2024, 2)).toBe(29);
    expect(joursDansMois(2000, 2)).toBe(29);
    expect(joursDansMois(1900, 2)).toBe(28);
    expect(joursDansMois(2026, 4)).toBe(30);
  });
});

describe("deriverDateLimite", () => {
  it("place la date au jour demandé (clampé à la longueur du mois)", () => {
    expect(deriverDateLimite(2026, 5, 25)).toBe("2026-05-25");
    expect(deriverDateLimite(2026, 2, 31)).toBe("2026-02-28"); // clamp
    expect(deriverDateLimite(2026, 3, 5)).toBe("2026-03-05");
  });

  it("jour null/invalide → dernier jour du mois", () => {
    expect(deriverDateLimite(2026, 4, null)).toBe("2026-04-30");
    expect(deriverDateLimite(2026, 4, 0)).toBe("2026-04-30");
  });
});
