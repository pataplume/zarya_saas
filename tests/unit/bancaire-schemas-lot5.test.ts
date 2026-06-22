/**
 * Lot 5 (ADR 0025 §6) — tests unitaires des schémas Zod bancaire / facturation / accès logiciel.
 * Logique pure (pas de DB). Vérifie : normalisation IBAN, rejets de format, enums, coercitions
 * numériques des honoraires, et que les champs sensibles sont bien validés AVANT chiffrement.
 */
import { describe, expect, test } from "vitest";
import {
  createBanqueSchema,
  upsertAccesLogicielSchema,
  upsertRelationSchema,
} from "../../packages/schemas/src/bancaire";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const IBAN_VALIDE = "CH9300762011623852957";

describe("createBanqueSchema", () => {
  test("normalise l'IBAN (espaces retirés, majuscules)", () => {
    const r = createBanqueSchema.safeParse({
      client_id: CLIENT,
      iban: "ch93 0076 2011 6238 5295 7",
      usage: "principal",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.iban).toBe(IBAN_VALIDE);
  });

  test("rejette un IBAN au format invalide", () => {
    const r = createBanqueSchema.safeParse({ client_id: CLIENT, iban: "FOO123" });
    expect(r.success).toBe(false);
  });

  test("rejette un usage hors enum", () => {
    const r = createBanqueSchema.safeParse({
      client_id: CLIENT,
      iban: IBAN_VALIDE,
      usage: "epargne",
    });
    expect(r.success).toBe(false);
  });

  test("accepte des credentials Open Banking optionnels", () => {
    const r = createBanqueSchema.safeParse({
      client_id: CLIENT,
      iban: IBAN_VALIDE,
      credentials_open_banking: '{"user":"x","pass":"y"}',
    });
    expect(r.success).toBe(true);
  });

  test("rejette un client_id non-uuid", () => {
    const r = createBanqueSchema.safeParse({ client_id: "nope", iban: IBAN_VALIDE });
    expect(r.success).toBe(false);
  });
});

describe("upsertRelationSchema", () => {
  test("coerce honoraires_mensuels depuis une chaîne", () => {
    const r = upsertRelationSchema.safeParse({ client_id: CLIENT, honoraires_mensuels: "1200.50" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.honoraires_mensuels).toBe(1200.5);
  });

  test("rejette des honoraires négatifs", () => {
    const r = upsertRelationSchema.safeParse({ client_id: CLIENT, honoraires_mensuels: "-5" });
    expect(r.success).toBe(false);
  });

  test("valide et normalise l'IBAN de facturation (sensible)", () => {
    const r = upsertRelationSchema.safeParse({
      client_id: CLIENT,
      iban_facturation: "ch93 0076 2011 6238 5295 7",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.iban_facturation).toBe(IBAN_VALIDE);
  });

  test("rejette un modèle d'honoraires hors enum", () => {
    const r = upsertRelationSchema.safeParse({
      client_id: CLIENT,
      honoraires_modele: "abonnement",
    });
    expect(r.success).toBe(false);
  });

  test("tous les champs optionnels : un client_id seul suffit", () => {
    const r = upsertRelationSchema.safeParse({ client_id: CLIENT });
    expect(r.success).toBe(true);
  });
});

describe("upsertAccesLogicielSchema", () => {
  test("exige des credentials non vides", () => {
    const r = upsertAccesLogicielSchema.safeParse({
      client_id: CLIENT,
      acces_logiciel_externe: "",
    });
    expect(r.success).toBe(false);
  });

  test("accepte des credentials valides", () => {
    const r = upsertAccesLogicielSchema.safeParse({
      client_id: CLIENT,
      acces_logiciel_externe: "user:abc;token:xyz",
    });
    expect(r.success).toBe(true);
  });
});
