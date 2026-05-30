// Tests unitaires du cœur PUR d'appariement document ↔ attente (B3).
// Aucune DB : periodeFrequence + matchDocumentAttendu (filtre, départage, ambiguïté).

import { describe, expect, test } from "vitest";
import {
  type AttenduRow,
  type DocumentSignals,
  matchDocumentAttendu,
  periodeFrequence,
} from "./match-document-attendu";

function attendu(over: Partial<AttenduRow> & { id: string }): AttenduRow {
  return { type_document: "Document", categorie: null, frequence: "mensuelle", ...over };
}

function doc(over: Partial<DocumentSignals>): DocumentSignals {
  return {
    type: "releve_bancaire",
    categorie: "bancaire",
    libelle: "Relevé",
    periode: "2026-04",
    ...over,
  };
}

describe("periodeFrequence", () => {
  test("formats canoniques → fréquence", () => {
    expect(periodeFrequence("2026-04")).toBe("mensuelle");
    expect(periodeFrequence("2026-Q1")).toBe("trimestrielle");
    expect(periodeFrequence("2026-q3")).toBe("trimestrielle");
    expect(periodeFrequence("2025")).toBe("annuelle");
  });

  test("absence / format inconnu → null", () => {
    expect(periodeFrequence(null)).toBeNull();
    expect(periodeFrequence("")).toBeNull();
    expect(periodeFrequence("2026-13")).toBeNull(); // mois invalide
    expect(periodeFrequence("avril 2026")).toBeNull();
  });
});

describe("matchDocumentAttendu", () => {
  test("aucune période (ponctuel) → pas d'appariement", () => {
    expect(matchDocumentAttendu(doc({ periode: null }), [attendu({ id: "a1" })])).toBeNull();
  });

  test("match unique sur fréquence + catégorie", () => {
    const res = matchDocumentAttendu(doc({ periode: "2026-04", categorie: "bancaire" }), [
      attendu({ id: "a1", frequence: "mensuelle", categorie: "bancaire" }),
      attendu({ id: "a2", frequence: "annuelle", categorie: "fiscal" }),
    ]);
    expect(res).toBe("a1");
  });

  test("attente sans catégorie matche n'importe quelle catégorie de même fréquence", () => {
    const res = matchDocumentAttendu(doc({ periode: "2025", categorie: "fiscal" }), [
      attendu({ id: "a1", frequence: "annuelle", categorie: null }),
    ]);
    expect(res).toBe("a1");
  });

  test("catégorie différente (attente catégorisée) → pas de match", () => {
    const res = matchDocumentAttendu(doc({ periode: "2026-04", categorie: "bancaire" }), [
      attendu({ id: "a1", frequence: "mensuelle", categorie: "salaire" }),
    ]);
    expect(res).toBeNull();
  });

  test("ex æquo départagés par recouvrement de tokens du libellé d'attente", () => {
    const res = matchDocumentAttendu(
      doc({
        periode: "2026-04",
        categorie: "bancaire",
        type: "releve_bancaire",
        libelle: "Relevé UBS avril",
      }),
      [
        attendu({
          id: "ubs",
          frequence: "mensuelle",
          categorie: "bancaire",
          type_document: "Relevé bancaire UBS",
        }),
        attendu({
          id: "cs",
          frequence: "mensuelle",
          categorie: "bancaire",
          type_document: "Relevé bancaire Credit Suisse",
        }),
      ],
    );
    expect(res).toBe("ubs");
  });

  test("ex æquo sans recouvrement distinctif → ambigu, on ne lie rien", () => {
    const res = matchDocumentAttendu(
      doc({ periode: "2026-04", categorie: "bancaire", type: "releve", libelle: "Relevé" }),
      [
        attendu({
          id: "ubs",
          frequence: "mensuelle",
          categorie: "bancaire",
          type_document: "Compte XYZ",
        }),
        attendu({
          id: "cs",
          frequence: "mensuelle",
          categorie: "bancaire",
          type_document: "Compte ABC",
        }),
      ],
    );
    expect(res).toBeNull();
  });

  test("aucune attente du client → null", () => {
    expect(matchDocumentAttendu(doc({ periode: "2026-04" }), [])).toBeNull();
  });
});
