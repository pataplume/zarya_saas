/**
 * Lot 1 (ADR 0025) — Schémas Zod du dossier client éditable (logique pure, sans DB).
 * Vérifie le contrat de validation des champs étendus + contacts + adresses.
 */
import { describe, expect, test } from "vitest";
import {
  createAdresseSchema,
  createContactSchema,
  updateAdresseSchema,
  updateClientSchema,
  updateContactSchema,
} from "../../packages/schemas/src/index";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("updateClientSchema", () => {
  test("accepte les champs étendus", () => {
    const r = updateClientSchema.safeParse({
      id: UUID,
      type: "association",
      langue: "de",
      ide: "CHE-123.456.789",
      tags: ["VIP", "sensible"],
      notes_commerciales: "note",
      responsable_id: UUID,
    });
    expect(r.success).toBe(true);
  });

  test("rejette un type client hors enum", () => {
    const r = updateClientSchema.safeParse({ id: UUID, type: "startup" });
    expect(r.success).toBe(false);
  });

  test("rejette un IDE malformé", () => {
    const r = updateClientSchema.safeParse({ id: UUID, ide: "123" });
    expect(r.success).toBe(false);
  });

  test("rejette un id non-uuid", () => {
    const r = updateClientSchema.safeParse({ id: "abc", langue: "fr" });
    expect(r.success).toBe(false);
  });
});

describe("contact schemas", () => {
  test("create exige nom + client_id", () => {
    expect(createContactSchema.safeParse({ client_id: UUID, nom: "Dupont" }).success).toBe(true);
    expect(createContactSchema.safeParse({ client_id: UUID }).success).toBe(false);
    expect(createContactSchema.safeParse({ nom: "Dupont" }).success).toBe(false);
  });

  test("email invalide rejeté", () => {
    const r = createContactSchema.safeParse({ client_id: UUID, nom: "X", email: "pas-un-email" });
    expect(r.success).toBe(false);
  });

  test("update accepte les flags booléens", () => {
    const r = updateContactSchema.safeParse({
      id: UUID,
      est_principal: true,
      est_contact_rh: false,
      est_signataire: true,
    });
    expect(r.success).toBe(true);
  });
});

describe("adresse schemas", () => {
  test("create exige type + client_id", () => {
    expect(createAdresseSchema.safeParse({ client_id: UUID, type: "siege" }).success).toBe(true);
    expect(createAdresseSchema.safeParse({ client_id: UUID, type: "garage" }).success).toBe(false);
  });

  test("canton sur 2 lettres max", () => {
    const r = createAdresseSchema.safeParse({ client_id: UUID, type: "siege", canton: "VAUD" });
    expect(r.success).toBe(false);
  });

  test("pays sur exactement 2 lettres", () => {
    expect(updateAdresseSchema.safeParse({ id: UUID, pays: "CHE" }).success).toBe(false);
    expect(updateAdresseSchema.safeParse({ id: UUID, pays: "CH" }).success).toBe(true);
  });
});
