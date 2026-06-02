// F6b — métadonnées de champs employé : normalisation d'en-têtes + masquage sensible.
import { describe, expect, it } from "vitest";
import {
  CHAMPS_OBLIGATOIRES_SWISSDEC,
  CHAMPS_SENSIBLES_VAULT,
  masquerAvs,
  masquerIban,
  masquerSensible,
  normaliserEntete,
} from "./employe-fields";

describe("normaliserEntete", () => {
  it("mappe FR/DE/EN vers le champ canonique (accents/casse/ponctuation ignorés)", () => {
    expect(normaliserEntete("Prénom")).toBe("prenom");
    expect(normaliserEntete("Vorname")).toBe("prenom");
    expect(normaliserEntete("First Name")).toBe("prenom");
    expect(normaliserEntete("N° AVS")).toBe("numero_avs");
    expect(normaliserEntete("AHV-Nr.")).toBe("numero_avs");
    expect(normaliserEntete("IBAN")).toBe("iban");
    expect(normaliserEntete("Salaire mensuel")).toBe("salaire_base_mensuel");
    expect(normaliserEntete("Taux d'activité")).toBe("taux_activite");
  });

  it("renvoie null pour un en-tête inconnu", () => {
    expect(normaliserEntete("Couleur préférée")).toBeNull();
    expect(normaliserEntete("")).toBeNull();
  });
});

describe("masquage sensible (ADR 0013)", () => {
  it("masque l'AVS en conservant le préfixe pays", () => {
    expect(masquerAvs("756.1234.5678.97")).toBe("756.****.****.**");
    expect(masquerSensible("numero_avs", "7561234567897")).toBe("756.****.****.**");
  });

  it("masque l'IBAN en conservant pays + 4 derniers", () => {
    expect(masquerIban("CH93 0076 2011 6238 5295 7")).toBe("CH..****2957");
    expect(masquerSensible("iban", "CH9300762011623852957")).toBe("CH..****2957");
  });

  it("ne masque pas un champ non sensible", () => {
    expect(masquerSensible("prenom", "Jean")).toBe("Jean");
  });
});

describe("registres de champs", () => {
  it("AVS et date d'entrée sont obligatoires Swissdec", () => {
    expect(CHAMPS_OBLIGATOIRES_SWISSDEC.has("numero_avs")).toBe(true);
    expect(CHAMPS_OBLIGATOIRES_SWISSDEC.has("date_entree")).toBe(true);
    expect(CHAMPS_OBLIGATOIRES_SWISSDEC.has("fonction")).toBe(false);
  });

  it("AVS et IBAN sont les seuls champs Vault", () => {
    expect(CHAMPS_SENSIBLES_VAULT.has("numero_avs")).toBe(true);
    expect(CHAMPS_SENSIBLES_VAULT.has("iban")).toBe(true);
    expect(CHAMPS_SENSIBLES_VAULT.has("salaire_base_mensuel")).toBe(false);
  });
});
