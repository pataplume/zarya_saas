import { describe, expect, test } from "vitest";
import { type ChampsProposition, diffValidation } from "./validation";

const base: ChampsProposition = {
  client_id: "c1",
  type: "facture_fournisseur",
  categorie: "commercial",
  periode: "2026-04",
  libelle: "Facture Swisscom",
};

describe("diffValidation", () => {
  test("aucune correction → corrige=false, corrections vide", () => {
    const { corrige, corrections } = diffValidation(base, { ...base });
    expect(corrige).toBe(false);
    expect(corrections).toEqual({});
  });

  test("un champ modifié → corrige=true avec le détail propose/retenu", () => {
    const { corrige, corrections } = diffValidation(base, { ...base, categorie: "fiscal" });
    expect(corrige).toBe(true);
    expect(corrections.categorie).toEqual({ propose: "commercial", retenu: "fiscal" });
    expect(corrections.type).toBeUndefined();
  });

  test("plusieurs champs modifiés sont tous journalisés", () => {
    const { corrections } = diffValidation(base, {
      ...base,
      type: "autre",
      periode: "2026-05",
    });
    expect(Object.keys(corrections).sort()).toEqual(["periode", "type"]);
  });

  test("null ↔ chaîne vide ↔ espaces sont équivalents (pas une correction)", () => {
    const propose: ChampsProposition = { ...base, periode: null };
    const retenu: ChampsProposition = { ...base, periode: "   " };
    expect(diffValidation(propose, retenu).corrige).toBe(false);
  });

  test("attribution d'un client absent de la proposition est une correction", () => {
    const propose: ChampsProposition = { ...base, client_id: null };
    const { corrige, corrections } = diffValidation(propose, base);
    expect(corrige).toBe(true);
    expect(corrections.client_id).toEqual({ propose: null, retenu: "c1" });
  });

  test("les valeurs sont trimées avant comparaison", () => {
    const { corrige } = diffValidation(base, { ...base, libelle: "  Facture Swisscom  " });
    expect(corrige).toBe(false);
  });
});
