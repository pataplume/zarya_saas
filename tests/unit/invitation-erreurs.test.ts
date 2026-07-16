/**
 * P0-6 — Mapping des erreurs `inviteUserByEmail` (Supabase Auth) vers des messages
 * français actionnables (AUDIT-MVP §8). Fonctions pures — aucune connexion DB.
 */
import { describe, expect, it } from "vitest";
import {
  estCompteDejaExistant,
  estLimiteEnvoiAtteinte,
  messageErreurInvitation,
} from "@/lib/invitation-erreurs";

describe("estCompteDejaExistant", () => {
  it("détecte le code email_exists", () => {
    expect(estCompteDejaExistant({ code: "email_exists", status: 422 })).toBe(true);
  });

  it("détecte le message GoTrue « already been registered »", () => {
    expect(
      estCompteDejaExistant({
        message: "A user with this email address has already been registered",
        status: 422,
      }),
    ).toBe(true);
  });

  it("détecte la variante « already exists »", () => {
    expect(estCompteDejaExistant({ message: "User already exists" })).toBe(true);
  });

  it("ne matche pas une erreur quelconque ni null", () => {
    expect(estCompteDejaExistant({ message: "Internal server error", status: 500 })).toBe(false);
    expect(estCompteDejaExistant(null)).toBe(false);
  });
});

describe("estLimiteEnvoiAtteinte", () => {
  it("détecte le code over_email_send_rate_limit", () => {
    expect(estLimiteEnvoiAtteinte({ code: "over_email_send_rate_limit", status: 429 })).toBe(true);
  });

  it("détecte le statut HTTP 429", () => {
    expect(estLimiteEnvoiAtteinte({ status: 429 })).toBe(true);
  });

  it("détecte le message « email rate limit exceeded »", () => {
    expect(estLimiteEnvoiAtteinte({ message: "email rate limit exceeded" })).toBe(true);
  });

  it("ne matche pas une erreur quelconque ni null", () => {
    expect(estLimiteEnvoiAtteinte({ message: "Internal server error", status: 500 })).toBe(false);
    expect(estLimiteEnvoiAtteinte(null)).toBe(false);
  });
});

describe("messageErreurInvitation", () => {
  it("compte existant + renvoi disponible → oriente vers « Renvoyer l'invitation »", () => {
    const msg = messageErreurInvitation(
      { code: "email_exists", status: 422 },
      { renvoiDisponible: true },
    );
    expect(msg).toContain("Un compte existe déjà pour cet email");
    expect(msg).toContain("Renvoyer l'invitation");
  });

  it("compte existant sans mécanisme de renvoi → oriente vers la connexion", () => {
    const msg = messageErreurInvitation({ code: "email_exists", status: 422 });
    expect(msg).toContain("Un compte existe déjà pour cet email");
    expect(msg).not.toContain("Renvoyer l'invitation");
    expect(msg).toContain("se connecter");
  });

  it("rate limit → message d'attente explicite", () => {
    const msg = messageErreurInvitation({ code: "over_email_send_rate_limit", status: 429 });
    expect(msg).toContain("Limite d'envoi d'emails atteinte");
  });

  it("erreur inconnue (ou absente) → message générique actionnable", () => {
    expect(messageErreurInvitation({ message: "Internal server error", status: 500 })).toContain(
      "L'envoi de l'email d'invitation a échoué",
    );
    expect(messageErreurInvitation(null)).toContain("L'envoi de l'email d'invitation a échoué");
  });
});
