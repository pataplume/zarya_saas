/**
 * F4 — Checklist documents par services (cœur pur codé). Réf : onboarding-client §6.2.
 */
import { describe, expect, it } from "vitest";
import { checklistPourServices } from "../../apps/web/lib/checklist-onboarding";

describe("checklistPourServices", () => {
  it("comptabilité → relevé + factures achats/ventes", () => {
    const docs = checklistPourServices("pme", ["comptabilite"]);
    const types = docs.map((d) => d.type_document);
    expect(types).toContain("releve_bancaire");
    expect(types).toContain("factures_achats");
    expect(types).toContain("factures_ventes");
  });

  it("TVA + salaires ajoutent leurs documents", () => {
    const types = checklistPourServices("pme", ["tva", "salaires"]).map((d) => d.type_document);
    expect(types).toEqual(
      expect.arrayContaining(["decompte_tva", "decompte_salaire", "certificat_salaire"]),
    );
  });

  it("déduplique par type_document et conseil n'ajoute rien", () => {
    const docs = checklistPourServices("pme", ["comptabilite", "comptabilite", "conseil"]);
    expect(new Set(docs.map((d) => d.type_document)).size).toBe(docs.length);
    expect(docs.length).toBe(3);
  });

  it("un particulier (prive) n'a pas de factures de ventes", () => {
    const types = checklistPourServices("prive", ["comptabilite"]).map((d) => d.type_document);
    expect(types).not.toContain("factures_ventes");
    expect(types).toContain("releve_bancaire");
  });

  it("aucun service → checklist vide", () => {
    expect(checklistPourServices("pme", [])).toEqual([]);
  });

  it("porte un type_code canonique aligné sur le catalogue (couverture C4, mig 0048)", () => {
    const byDoc = new Map(
      checklistPourServices("pme", ["comptabilite", "tva", "salaires", "fiscalite"]).map((d) => [
        d.type_document,
        d.type_code,
      ]),
    );
    // Slugs onboarding → slugs catalogue crm.standard_type_document.
    expect(byDoc.get("releve_bancaire")).toBe("releve_bancaire");
    expect(byDoc.get("factures_achats")).toBe("facture_fournisseur");
    expect(byDoc.get("decompte_tva")).toBe("declaration_tva");
    expect(byDoc.get("decompte_salaire")).toBe("decompte_salaire");
    expect(byDoc.get("certificat_salaire")).toBe("certificat_salaire");
    expect(byDoc.get("declaration_impot")).toBe("declaration_impot");
    // Pas de slug catalogue dédié → null (non gaté, sûr).
    expect(byDoc.get("factures_ventes")).toBeNull();
  });

  it("chaque doc porte une fréquence et une catégorie valides", () => {
    for (const d of checklistPourServices("pme", [
      "comptabilite",
      "tva",
      "salaires",
      "bouclement",
      "fiscalite",
    ])) {
      expect(["bancaire", "fiscal", "salaire", "commercial", "administratif"]).toContain(
        d.categorie,
      );
      expect(["mensuelle", "trimestrielle", "semestrielle", "annuelle", "ponctuelle"]).toContain(
        d.frequence,
      );
    }
  });
});
