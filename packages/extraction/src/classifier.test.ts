import { describe, expect, test } from "vitest";
import { getClassifier, StubClassifier } from "./classifier";
import { InfomaniakClassifier } from "./infomaniak-classifier";

describe("StubClassifier", () => {
  const c = new StubClassifier();

  test.each([
    ["releve_ubs_2026-04.pdf", "releve_bancaire", "bancaire"],
    ["Facture_Swisscom.pdf", "facture_fournisseur", "commercial"],
    ["declaration_tva_2026-Q1.pdf", "declaration_tva", "fiscal"],
    ["decompte_salaire_avril.pdf", "decompte_salaire", "salaire"],
    ["contrat_travail_dupont.pdf", "contrat_travail", "salaire"],
  ])("classe %s en %s/%s", async (nom, type, categorie) => {
    const { proposal } = await c.classify({ nom_fichier: nom });
    expect(proposal.type).toBe(type);
    expect(proposal.categorie).toBe(categorie);
    expect(proposal.confiance_globale).toBeGreaterThan(0);
  });

  test("fichier non reconnu → a_classer / autre avec anomalie", async () => {
    const { proposal } = await c.classify({ nom_fichier: "scan0001.pdf" });
    expect(proposal.type).toBe("a_classer");
    expect(proposal.categorie).toBe("autre");
    expect(proposal.anomalies).toContain("type_indetermine");
  });

  test("extrait la période YYYY-MM du nom de fichier", async () => {
    const { proposal } = await c.classify({ nom_fichier: "releve_2026-04.pdf" });
    expect(proposal.periode).toBe("2026-04");
  });

  test("extrait le trimestre YYYY-Qn", async () => {
    const { proposal } = await c.classify({ nom_fichier: "tva-2026-Q1.pdf" });
    expect(proposal.periode).toBe("2026-Q1");
  });

  test("traçabilité : model_used=stub, prompt_version figée", async () => {
    const res = await c.classify({ nom_fichier: "facture.pdf" });
    expect(res.model_used).toBe("stub");
    expect(res.prompt_version).toBe("stub-classify-v1");
  });
});

describe("getClassifier", () => {
  test("défaut → stub", () => {
    expect(getClassifier("stub")).toBeInstanceOf(StubClassifier);
  });

  test("live → Infomaniak (souveraineté CH, ADR 0010)", () => {
    expect(getClassifier("live")).toBeInstanceOf(InfomaniakClassifier);
  });
});
