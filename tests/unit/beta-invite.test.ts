/**
 * P0-7 — gating optionnel de /signup par code d'invitation (BETA_INVITE_CODE).
 * Contrat : env absente/vide = gating inactif (signup ouvert, comportement
 * historique) ; env définie = le code saisi doit correspondre (trim des deux
 * côtés). Fonctions pures — aucune connexion DB, aucun accès à process.env.
 */
import { describe, expect, it } from "vitest";
import { inviteGatingActif, verifierCodeInvitation } from "../../apps/web/lib/beta-invite";

describe("inviteGatingActif", () => {
  it("inactif si BETA_INVITE_CODE est absente ou vide", () => {
    expect(inviteGatingActif(undefined)).toBe(false);
    expect(inviteGatingActif(null)).toBe(false);
    expect(inviteGatingActif("")).toBe(false);
    expect(inviteGatingActif("   ")).toBe(false);
  });

  it("actif dès qu'un code non vide est défini", () => {
    expect(inviteGatingActif("ZARYA-BETA-2026")).toBe(true);
    expect(inviteGatingActif("  x  ")).toBe(true);
  });
});

describe("verifierCodeInvitation", () => {
  it("gating inactif : tout est accepté (y compris aucun code saisi)", () => {
    expect(verifierCodeInvitation(undefined, undefined)).toBe(true);
    expect(verifierCodeInvitation("n'importe quoi", "")).toBe(true);
    expect(verifierCodeInvitation(undefined, "   ")).toBe(true);
  });

  it("gating actif : accepte le code exact, avec trim des deux côtés", () => {
    expect(verifierCodeInvitation("ZARYA-BETA-2026", "ZARYA-BETA-2026")).toBe(true);
    expect(verifierCodeInvitation("  ZARYA-BETA-2026  ", "ZARYA-BETA-2026")).toBe(true);
    expect(verifierCodeInvitation("ZARYA-BETA-2026", "  ZARYA-BETA-2026  ")).toBe(true);
  });

  it("gating actif : refuse un code faux, vide, absent ou non-string", () => {
    expect(verifierCodeInvitation("mauvais-code", "ZARYA-BETA-2026")).toBe(false);
    expect(verifierCodeInvitation("zarya-beta-2026", "ZARYA-BETA-2026")).toBe(false); // sensible à la casse
    expect(verifierCodeInvitation("", "ZARYA-BETA-2026")).toBe(false);
    expect(verifierCodeInvitation(undefined, "ZARYA-BETA-2026")).toBe(false);
    expect(verifierCodeInvitation(null, "ZARYA-BETA-2026")).toBe(false);
    expect(verifierCodeInvitation(42, "ZARYA-BETA-2026")).toBe(false);
  });
});
