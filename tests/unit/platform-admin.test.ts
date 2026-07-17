/**
 * P0-7 — accès plateforme au back-office /app/admin/demandes : parsing de
 * PLATFORM_ADMIN_EMAILS (liste séparée par virgules) + matching insensible à la
 * casse. Fonctions pures — aucune connexion DB, aucun accès à process.env.
 */
import { describe, expect, it } from "vitest";
import { isPlatformAdmin, parsePlatformAdminEmails } from "../../apps/web/lib/platform-admin";

describe("parsePlatformAdminEmails", () => {
  it("retourne [] si la variable est absente ou vide", () => {
    expect(parsePlatformAdminEmails(undefined)).toEqual([]);
    expect(parsePlatformAdminEmails(null)).toEqual([]);
    expect(parsePlatformAdminEmails("")).toEqual([]);
    expect(parsePlatformAdminEmails("   ")).toEqual([]);
  });

  it("découpe sur les virgules, trim les espaces et passe en minuscules", () => {
    expect(parsePlatformAdminEmails("Founder@Zarya.ch , ops@zarya.ch")).toEqual([
      "founder@zarya.ch",
      "ops@zarya.ch",
    ]);
  });

  it("ignore les entrées vides (virgules doublées, virgule finale)", () => {
    expect(parsePlatformAdminEmails("a@zarya.ch,,b@zarya.ch,")).toEqual([
      "a@zarya.ch",
      "b@zarya.ch",
    ]);
  });

  it("accepte une liste à une seule entrée", () => {
    expect(parsePlatformAdminEmails("founder@zarya.ch")).toEqual(["founder@zarya.ch"]);
  });
});

describe("isPlatformAdmin", () => {
  const LISTE = "Founder@Zarya.ch, ops@zarya.ch";

  it("matche insensible à la casse, des deux côtés", () => {
    expect(isPlatformAdmin("founder@zarya.ch", LISTE)).toBe(true);
    expect(isPlatformAdmin("FOUNDER@ZARYA.CH", LISTE)).toBe(true);
    expect(isPlatformAdmin("Ops@Zarya.CH", LISTE)).toBe(true);
  });

  it("tolère les espaces autour de l'email vérifié", () => {
    expect(isPlatformAdmin("  founder@zarya.ch  ", LISTE)).toBe(true);
  });

  it("refuse un email hors liste", () => {
    expect(isPlatformAdmin("intrus@zarya.ch", LISTE)).toBe(false);
    expect(isPlatformAdmin("founder@zarya.ch.evil.com", LISTE)).toBe(false);
  });

  it("refuse tout le monde si la liste est absente ou vide (défaut fermé)", () => {
    expect(isPlatformAdmin("founder@zarya.ch", undefined)).toBe(false);
    expect(isPlatformAdmin("founder@zarya.ch", "")).toBe(false);
    expect(isPlatformAdmin("founder@zarya.ch", "  ,  ")).toBe(false);
  });

  it("refuse un email absent ou vide", () => {
    expect(isPlatformAdmin(undefined, LISTE)).toBe(false);
    expect(isPlatformAdmin(null, LISTE)).toBe(false);
    expect(isPlatformAdmin("", LISTE)).toBe(false);
    expect(isPlatformAdmin("   ", LISTE)).toBe(false);
  });
});
