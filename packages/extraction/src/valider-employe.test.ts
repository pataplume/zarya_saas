// F6c — cœur pur validation employé : checksum AVS, doublons, champs bloquants.
import { describe, expect, it } from "vitest";
import type { ChampPourFinalisation } from "./valider-employe";
import { champsBloquants, detectDoublonsParIdentite, isValidAvs } from "./valider-employe";

describe("isValidAvs", () => {
  it("accepte un AVS valide (préfixe 756 + checksum EAN-13)", () => {
    expect(isValidAvs("756.1234.5678.97")).toBe(true);
    expect(isValidAvs("7561234567897")).toBe(true);
    expect(isValidAvs("756.0000.0000.02")).toBe(true);
  });

  it("rejette mauvais checksum, mauvais préfixe, mauvaise longueur, vide", () => {
    expect(isValidAvs("756.1234.5678.90")).toBe(false); // checksum faux (devrait être 7)
    expect(isValidAvs("750.1234.5678.97")).toBe(false); // préfixe ≠ 756
    expect(isValidAvs("756.1234.5678")).toBe(false); // trop court
    expect(isValidAvs("")).toBe(false);
    expect(isValidAvs(null)).toBe(false);
  });
});

describe("detectDoublonsParIdentite", () => {
  const existants = [
    { id: "a", nom: "Dupont", prenom: "Jean", date_naissance: "1985-03-12" },
    { id: "b", nom: "Müller", prenom: "Marie", date_naissance: "1990-01-01" },
  ];

  it("matche nom+prénom (accents/casse ignorés) + date si présente des deux côtés", () => {
    expect(
      detectDoublonsParIdentite(
        { nom: "DUPONT", prenom: "jean", date_naissance: "1985-03-12" },
        existants,
      ),
    ).toEqual(["a"]);
    // date différente → pas de match
    expect(
      detectDoublonsParIdentite(
        { nom: "Dupont", prenom: "Jean", date_naissance: "2000-01-01" },
        existants,
      ),
    ).toEqual([]);
  });

  it("ne matche pas si nom ou prénom manquant", () => {
    expect(detectDoublonsParIdentite({ nom: "Dupont", prenom: "" }, existants)).toEqual([]);
  });
});

describe("champsBloquants", () => {
  const obligatoires = ["prenom", "nom", "date_naissance", "numero_avs", "date_entree"] as const;
  const tousValides: ChampPourFinalisation[] = obligatoires.map((n) => ({
    nom_champ: n,
    statut: "valide",
    obligatoire_swissdec: true,
  }));

  it("vide quand tous les obligatoires sont valide/modifie", () => {
    expect(champsBloquants(tousValides)).toEqual([]);
  });

  it("liste les obligatoires non validés (propose/manquant/absent)", () => {
    const champs: ChampPourFinalisation[] = [
      { nom_champ: "prenom", statut: "valide", obligatoire_swissdec: true },
      { nom_champ: "nom", statut: "modifie", obligatoire_swissdec: true },
      { nom_champ: "numero_avs", statut: "propose", obligatoire_swissdec: true },
      // date_naissance + date_entree absents
    ];
    const bloquants = champsBloquants(champs);
    expect(bloquants).toContain("numero_avs");
    expect(bloquants).toContain("date_naissance");
    expect(bloquants).toContain("date_entree");
    expect(bloquants).not.toContain("prenom");
  });
});
