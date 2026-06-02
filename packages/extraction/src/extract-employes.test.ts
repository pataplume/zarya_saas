// F6b — extracteur déterministe + mode manuel.
import { describe, expect, it } from "vitest";
import { buildManualProposal, DeterministicEmployesExtractor } from "./extract-employes";
import type { LigneEmploye } from "./parse-employes-file";

const extractor = new DeterministicEmployesExtractor();

describe("DeterministicEmployesExtractor", () => {
  it("propose chaque cellule lue avec confiance 1 et marque les obligatoires manquants", async () => {
    const lignes: LigneEmploye[] = [
      {
        prenom: { valeur: "Jean", source_cellule: "A2" },
        nom: { valeur: "Dupont", source_cellule: "B2" },
        numero_avs: { valeur: "756.1234.5678.97", source_cellule: "C2" },
        // date_naissance + date_entree absents → manquant
      },
    ];
    const res = await extractor.extract({ nom_fichier: "x.csv", lignes });
    expect(res.nb_employes_detectes).toBe(1);
    const emp = res.employes[0];
    if (!emp) throw new Error("proposition attendue");
    const prenom = emp.champs.find((c) => c.nom_champ === "prenom");
    expect(prenom?.confiance).toBe(1);
    expect(prenom?.statut).toBe("propose");
    expect(prenom?.source_cellule).toBe("A2");
    const dateNaissance = emp.champs.find((c) => c.nom_champ === "date_naissance");
    expect(dateNaissance?.statut).toBe("manquant");
    expect(dateNaissance?.valeur_proposee).toBeNull();
    expect(emp.anomalies.some((a) => a.startsWith("champs_obligatoires_manquants"))).toBe(true);
  });

  it("ligne complète sur les obligatoires → aucune anomalie de manquant", async () => {
    const lignes: LigneEmploye[] = [
      {
        prenom: { valeur: "Anne", source_cellule: "A2" },
        nom: { valeur: "Roux", source_cellule: "B2" },
        date_naissance: { valeur: "1990-05-01", source_cellule: "C2" },
        numero_avs: { valeur: "756.1111.2222.33", source_cellule: "D2" },
        date_entree: { valeur: "2023-09-01", source_cellule: "E2" },
      },
    ];
    const res = await extractor.extract({ nom_fichier: "x.csv", lignes });
    const emp = res.employes[0];
    expect(emp?.anomalies).toHaveLength(0);
    expect(emp?.confiance_globale).toBe(1);
  });

  it("fichier vide → aucune proposition", async () => {
    const res = await extractor.extract({ nom_fichier: "x.csv", lignes: [] });
    expect(res.nb_employes_detectes).toBe(0);
    expect(res.confiance_globale).toBe(0);
  });
});

describe("buildManualProposal", () => {
  it("construit une proposition depuis une saisie directe (champs non vides)", () => {
    const p = buildManualProposal({ prenom: "Léa", nom: "Berger", numero_avs: "756.5555.4444.33" });
    const prenom = p.champs.find((c) => c.nom_champ === "prenom");
    expect(prenom?.valeur_proposee).toBe("Léa");
    expect(prenom?.source_cellule).toBe("saisie");
    // obligatoires absents marqués manquant
    expect(p.champs.find((c) => c.nom_champ === "date_entree")?.statut).toBe("manquant");
  });
});
