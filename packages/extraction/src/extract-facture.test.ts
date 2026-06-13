import { describe, expect, it } from "vitest";
import {
  applyQrBill,
  coerceDevise,
  type FactureProposal,
  getFactureExtractor,
  StubFactureExtractor,
  toFactureProposal,
} from "./extract-facture";
import { InfomaniakFactureExtractor } from "./infomaniak-facture-extractor";
import { parseSwissQrBill, type QrBillDecodeResult } from "./qr-bill";

// Payload SPC QRR valide (exemple canonique SIX) → QrBillDecodeResult valide.
const VALID_QR_PAYLOAD = [
  "SPC",
  "0200",
  "1",
  "CH4431999123000889012",
  "S",
  "Robert Schneider AG",
  "Rue du Lac",
  "1268",
  "2501",
  "Biel",
  "CH",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "1949.75",
  "CHF",
  "S",
  "Pia-Maria Rutschmann-Schnyder",
  "Grosse Marktgasse",
  "28",
  "9400",
  "Rorschach",
  "CH",
  "QRR",
  "210000000003139471430009017",
  "Instruction of 15.09.2019",
  "EPD",
].join("\n");

const validQr: QrBillDecodeResult = parseSwissQrBill(VALID_QR_PAYLOAD);

function emptyProposal(over: Partial<FactureProposal> = {}): FactureProposal {
  return {
    fournisseur: {
      raison_sociale: "ACME",
      ide: null,
      numero_tva: null,
      iban: "CH0000000000000000000",
      bic: null,
      adresse: null,
    },
    numero_facture: null,
    date_emission: null,
    date_echeance: null,
    reference: "old-ref",
    devise: "EUR",
    total_ht: null,
    total_tva: null,
    total_ttc: null,
    montant_a_payer: 10,
    taux_tva_principal: null,
    categorie_comptable: null,
    qr_facture_detecte: false,
    qr_facture_data: null,
    confiance_globale: 0.5,
    confiance_par_champ: {},
    anomalies: [],
    ...over,
  };
}

describe("applyQrBill (QR-first déterministe)", () => {
  it("écrase IBAN / montant / devise / référence depuis un QR-bill valide", () => {
    const r = applyQrBill(emptyProposal(), validQr);
    expect(r.qr_facture_detecte).toBe(true);
    expect(r.qr_facture_data?.iban).toBe("CH4431999123000889012");
    expect(r.fournisseur.iban).toBe("CH4431999123000889012");
    expect(r.montant_a_payer).toBe(1949.75);
    expect(r.devise).toBe("CHF");
    expect(r.reference).toBe("210000000003139471430009017");
    // Provenance par champ (ADR 0024) : les champs issus du QR → source "qr", confiance 1.
    expect(r.confiance_par_champ.iban).toEqual({ source: "qr", confiance: 1 });
    expect(r.confiance_par_champ.devise).toEqual({ source: "qr", confiance: 1 });
    expect(r.confiance_par_champ.reference).toEqual({ source: "qr", confiance: 1 });
    expect(r.confiance_par_champ.montant_a_payer).toEqual({ source: "qr", confiance: 1 });
  });

  it("laisse la proposition inchangée si pas de QR / QR invalide", () => {
    const sansQr = applyQrBill(emptyProposal(), null);
    expect(sansQr.qr_facture_detecte).toBe(false);
    expect(sansQr.fournisseur.iban).toBe("CH0000000000000000000");
    expect(sansQr.montant_a_payer).toBe(10);

    const bad = parseSwissQrBill("not-a-qr-bill");
    const r = applyQrBill(emptyProposal(), bad);
    expect(r.qr_facture_detecte).toBe(false);
    expect(r.devise).toBe("EUR");
  });

  it("ne touche pas au montant si le QR a un montant vide (facture ouverte)", () => {
    const openPayload = VALID_QR_PAYLOAD.split("\n");
    openPayload[18] = ""; // montant vide
    const open = parseSwissQrBill(openPayload.join("\n"));
    const r = applyQrBill(emptyProposal({ montant_a_payer: 42 }), open);
    expect(r.qr_facture_detecte).toBe(true);
    expect(r.montant_a_payer).toBe(42);
  });

  it("recoupement QR↔IA : IBAN IA différent du QR → anomalie fraude", () => {
    // emptyProposal a un IBAN IA (CH0000…) ≠ IBAN du QR (CH4431…) → divergence.
    const r = applyQrBill(emptyProposal(), validQr);
    expect(r.anomalies).toContain("incoherence_qr_ia_iban");
  });

  it("recoupement QR↔IA : IBAN IA identique au QR (espaces/casse) → pas d'anomalie", () => {
    const r = applyQrBill(
      emptyProposal({
        fournisseur: { ...emptyProposal().fournisseur, iban: "ch44 3199 9123 0008 8901 2" },
      }),
      validQr,
    );
    expect(r.anomalies).not.toContain("incoherence_qr_ia_iban");
  });

  it("recoupement QR↔IA : pas d'IBAN IA → pas d'anomalie de divergence", () => {
    const r = applyQrBill(
      emptyProposal({ fournisseur: { ...emptyProposal().fournisseur, iban: null } }),
      validQr,
    );
    expect(r.anomalies).not.toContain("incoherence_qr_ia_iban");
  });
});

describe("StubFactureExtractor", () => {
  it("produit une proposition minimale (validation humaine complète)", async () => {
    const r = await new StubFactureExtractor().extract({ nom_fichier: "facture_acme_2026.pdf" });
    expect(r.model_used).toBe("stub");
    expect(r.proposal.fournisseur.raison_sociale).toBe("facture acme 2026");
    expect(r.proposal.qr_facture_detecte).toBe(false);
    expect(r.proposal.anomalies).toContain("extraction_stub");
    expect(r.proposal.confiance_globale).toBeLessThan(0.5);
  });

  it("reporte les données de paiement du QR-bill même en mode stub", async () => {
    const r = await new StubFactureExtractor().extract({
      nom_fichier: "f.pdf",
      qr_bill: validQr,
    });
    expect(r.proposal.qr_facture_detecte).toBe(true);
    expect(r.proposal.fournisseur.iban).toBe("CH4431999123000889012");
    expect(r.proposal.montant_a_payer).toBe(1949.75);
  });
});

describe("toFactureProposal (normalisation sortie live)", () => {
  it("mappe et borne les champs ; coerce les nombres", () => {
    const p = toFactureProposal(
      {
        fournisseur_raison_sociale: "  Schneider AG ",
        fournisseur_ide: "CHE-123.456.789",
        fournisseur_iban: "CH9300762011623852957",
        total_ht: 100,
        total_tva: 8.1,
        total_ttc: 108.1,
        montant_a_payer: 108.1,
        taux_tva_principal: 8.1,
        devise: "CHF",
        confiance_globale: 1.5,
        confiance_fournisseur: 0.9,
        confiance_montants: 0.95,
        anomalies: [],
      },
      { nom_fichier: "f.pdf" },
    );
    expect(p).not.toBeNull();
    expect(p?.fournisseur.raison_sociale).toBe("Schneider AG");
    expect(p?.confiance_globale).toBe(1); // clampé à 1
    expect(p?.total_ttc).toBe(108.1);
    expect(p?.anomalies).not.toContain("tva_incoherente");
    // Provenance IA (ADR 0024) : sans QR, les confiances agrégées portent source "ia".
    expect(p?.confiance_par_champ.fournisseur).toEqual({ source: "ia", confiance: 0.9 });
    expect(p?.confiance_par_champ.montants).toEqual({ source: "ia", confiance: 0.95 });
  });

  it("détecte une incohérence de montants (ttc ≠ ht + tva)", () => {
    const p = toFactureProposal(
      {
        fournisseur_raison_sociale: "X",
        total_ht: 100,
        total_tva: 8.1,
        total_ttc: 200,
        devise: "CHF",
        confiance_globale: 0.8,
        confiance_fournisseur: 0.8,
        confiance_montants: 0.8,
        anomalies: [],
      },
      { nom_fichier: "f.pdf" },
    );
    expect(p?.anomalies).toContain("tva_incoherente");
  });

  it("applique le QR-bill par-dessus la sortie IA", () => {
    const p = toFactureProposal(
      {
        fournisseur_raison_sociale: "X",
        fournisseur_iban: "CH9300762011623852957",
        montant_a_payer: 5,
        devise: "EUR",
        confiance_globale: 0.8,
        confiance_fournisseur: 0.8,
        confiance_montants: 0.8,
        anomalies: [],
      },
      { nom_fichier: "f.pdf", qr_bill: validQr },
    );
    expect(p?.qr_facture_detecte).toBe(true);
    expect(p?.fournisseur.iban).toBe("CH4431999123000889012");
    expect(p?.montant_a_payer).toBe(1949.75);
    expect(p?.devise).toBe("CHF");
  });

  it("renvoie null sur une entrée non-objet", () => {
    expect(toFactureProposal(null, { nom_fichier: "f.pdf" })).toBeNull();
    expect(toFactureProposal("oops", { nom_fichier: "f.pdf" })).toBeNull();
  });
});

describe("coerceDevise / getFactureExtractor", () => {
  it("coerce les devises (défaut CHF)", () => {
    expect(coerceDevise("EUR")).toBe("EUR");
    expect(coerceDevise("USD")).toBe("USD");
    expect(coerceDevise("GBP")).toBe("CHF");
    expect(coerceDevise(null)).toBe("CHF");
  });

  it("résout stub par défaut, live en mode live", () => {
    expect(getFactureExtractor("stub")).toBeInstanceOf(StubFactureExtractor);
    expect(getFactureExtractor("live")).toBeInstanceOf(InfomaniakFactureExtractor);
  });
});
