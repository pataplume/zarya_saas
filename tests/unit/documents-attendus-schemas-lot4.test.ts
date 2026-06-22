/**
 * Lot 4 (ADR 0025) — Schémas Zod des documents attendus + cible de relance (logique pure).
 * Vérifie l'alignement sur les enums RÉELS scellés et le rejet des entrées invalides.
 */
import { describe, expect, test } from "vitest";
import {
  cibleRelanceSchema,
  createDocumentAttenduSchema,
  supprimerDocumentAttenduSchema,
  updateDocumentAttenduSchema,
} from "../../packages/schemas/src/index";

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

describe("createDocumentAttenduSchema", () => {
  test("nominal : type + fréquence requis, catégorie/délai optionnels", () => {
    const r = createDocumentAttenduSchema.safeParse({
      client_id: UUID,
      type_document: "Relevé bancaire",
      frequence: "mensuelle",
      categorie: "bancaire",
      obligatoire: true,
      deadline_jours_apres_periode: 30,
    });
    expect(r.success).toBe(true);
  });

  test("type_document vide rejeté", () => {
    const r = createDocumentAttenduSchema.safeParse({
      client_id: UUID,
      type_document: "  ",
      frequence: "mensuelle",
    });
    expect(r.success).toBe(false);
  });

  test("fréquence hors enum scellé rejetée", () => {
    const r = createDocumentAttenduSchema.safeParse({
      client_id: UUID,
      type_document: "X",
      frequence: "bimensuelle",
    });
    expect(r.success).toBe(false);
  });

  test("catégorie hors enum scellé rejetée", () => {
    const r = createDocumentAttenduSchema.safeParse({
      client_id: UUID,
      type_document: "X",
      frequence: "annuelle",
      categorie: "juridique",
    });
    expect(r.success).toBe(false);
  });

  test("délai négatif rejeté", () => {
    const r = createDocumentAttenduSchema.safeParse({
      client_id: UUID,
      type_document: "X",
      frequence: "annuelle",
      deadline_jours_apres_periode: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateDocumentAttenduSchema", () => {
  test("service_id null accepté (détacher le service)", () => {
    const r = updateDocumentAttenduSchema.safeParse({ id: UUID, service_id: null });
    expect(r.success).toBe(true);
  });

  test("délai null accepté (effacer le délai)", () => {
    const r = updateDocumentAttenduSchema.safeParse({
      id: UUID,
      deadline_jours_apres_periode: null,
    });
    expect(r.success).toBe(true);
  });

  test("id manquant rejeté", () => {
    const r = updateDocumentAttenduSchema.safeParse({ frequence: "mensuelle" });
    expect(r.success).toBe(false);
  });
});

describe("supprimerDocumentAttenduSchema", () => {
  test("uuid requis", () => {
    expect(supprimerDocumentAttenduSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(supprimerDocumentAttenduSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});

describe("cibleRelanceSchema", () => {
  test("cible échéance", () => {
    expect(cibleRelanceSchema.safeParse({ kind: "echeance", echeanceId: UUID }).success).toBe(true);
  });

  test("cible document", () => {
    expect(
      cibleRelanceSchema.safeParse({ kind: "document", documentAttenduId: UUID2 }).success,
    ).toBe(true);
  });

  test("cible client", () => {
    expect(cibleRelanceSchema.safeParse({ kind: "client", clientId: UUID }).success).toBe(true);
  });

  test("kind inconnu rejeté", () => {
    expect(cibleRelanceSchema.safeParse({ kind: "facture", id: UUID }).success).toBe(false);
  });

  test("uuid invalide rejeté", () => {
    expect(cibleRelanceSchema.safeParse({ kind: "echeance", echeanceId: "nope" }).success).toBe(
      false,
    );
  });
});
