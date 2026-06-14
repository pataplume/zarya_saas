/**
 * Anti-clair des traces d'audit (ADR 0013) : redactSensitiveForAudit caviarde IBAN/AVS partout
 * où ils apparaissent dans une valeur destinée à extraction.invocation.raw_output, sans toucher
 * aux champs fonctionnels (passe, champs, nombres). Le sceau anti-clair ne scanne que les noms
 * de colonnes — ce caviardage est la seule défense pour le contenu jsonb.
 */

import { redactSensitiveForAudit, redactSensitiveText } from "@zarya/extraction";
import { describe, expect, it } from "vitest";

const IBAN = "CH4431999123000889012"; // IBAN suisse valide (exemple QR-bill officiel)
const AVS = "756.1234.5678.97";

// Ré-applique les motifs de détection pour prouver l'absence de clair après caviardage.
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/;
const AVS_RE = /\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/;

describe("redactSensitiveText", () => {
  it("masque un IBAN isolé en conservant pays + 3 derniers caractères", () => {
    const out = redactSensitiveText(IBAN);
    expect(out).not.toContain(IBAN);
    expect(IBAN_RE.test(out)).toBe(false);
    expect(out).toContain("CH44");
    expect(out).toContain("012");
  });

  it("masque un IBAN noyé dans une phrase", () => {
    const out = redactSensitiveText(`Paiement vers ${IBAN} avant le 30.`);
    expect(out).not.toContain(IBAN);
    expect(out).toContain("Paiement vers");
    expect(out).toContain("avant le 30.");
  });

  it("masque un numéro AVS", () => {
    const out = redactSensitiveText(`AVS ${AVS} ok`);
    expect(out).not.toContain(AVS);
    expect(AVS_RE.test(out)).toBe(false);
  });

  it("laisse intacte une chaîne sans donnée sensible", () => {
    expect(redactSensitiveText("numero_facture FA-2026-001")).toBe("numero_facture FA-2026-001");
  });
});

describe("redactSensitiveForAudit", () => {
  it("masque un IBAN en valeur de champ d'objet (cas stub proposal)", () => {
    const out = redactSensitiveForAudit({
      mode: "stub",
      proposal: { fournisseur: { iban: IBAN, raison_sociale: "ACME SA" } },
    });
    expect(JSON.stringify(out)).not.toContain(IBAN);
    expect(JSON.stringify(out)).toContain("ACME SA");
  });

  it("masque un IBAN imbriqué dans une string JSON (cas réponse IA live)", () => {
    const liveResponse = {
      choices: [{ message: { content: `{"fournisseur_iban":"${IBAN}","total_ttc":120}` } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    const out = redactSensitiveForAudit(liveResponse);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(IBAN);
    expect(serialized).toContain("total_ttc");
    expect(serialized).toContain("prompt_tokens");
  });

  it("préserve les champs fonctionnels d'audit (passe, champs, nombres)", () => {
    const out = redactSensitiveForAudit({
      passe: 2,
      champs: ["numero_facture", "date_emission", "montant_a_payer"],
      extraction: { mode: "live", iban: IBAN },
    }) as { passe: number; champs: string[]; extraction: { iban: string } };
    expect(out.passe).toBe(2);
    expect(out.champs).toEqual(["numero_facture", "date_emission", "montant_a_payer"]);
    expect(out.extraction.iban).not.toContain(IBAN);
  });

  it("traite les tableaux et préserve null/undefined/booléens", () => {
    const out = redactSensitiveForAudit([IBAN, null, true, 42]) as unknown[];
    expect(out[0]).not.toContain(IBAN);
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(true);
    expect(out[3]).toBe(42);
  });

  it("caviarde le message d'une Error sans perdre le nom", () => {
    const out = redactSensitiveForAudit(new Error(`IBAN invalide: ${IBAN}`)) as {
      name: string;
      message: string;
    };
    expect(out.name).toBe("Error");
    expect(out.message).not.toContain(IBAN);
    expect(out.message).toContain("IBAN invalide");
  });
});
