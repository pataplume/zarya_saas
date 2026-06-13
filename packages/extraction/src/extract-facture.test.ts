import { describe, expect, it } from "vitest";
import {
  applyQrBill,
  champsACompleter,
  coerceDevise,
  type FactureProposal,
  fusionnerDeuxiemePasse,
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

describe("champsACompleter (2e passe IA — ADR 0024 §6)", () => {
  it("inclut un champ NULL (provenance ia faible)", () => {
    const p = emptyProposal({
      numero_facture: null,
      confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.9 } },
    });
    expect(champsACompleter(p)).toContain("numero_facture");
  });

  it("inclut un champ IA à faible confiance même non-null", () => {
    const p = emptyProposal({
      total_ttc: 108.1,
      confiance_par_champ: { montants: { source: "ia", confiance: 0.4 } },
    });
    expect(champsACompleter(p)).toContain("total_ttc");
  });

  it("exclut un champ IA à haute confiance ET non-null", () => {
    const p = emptyProposal({
      total_ttc: 108.1,
      total_ht: 100,
      total_tva: 8.1,
      montant_a_payer: 108.1,
      taux_tva_principal: 8.1,
      date_emission: "2026-01-01",
      date_echeance: "2026-02-01",
      confiance_par_champ: { montants: { source: "ia", confiance: 0.95 } },
    });
    expect(champsACompleter(p)).not.toContain("total_ttc");
    expect(champsACompleter(p)).not.toContain("montant_a_payer");
  });

  it("exclut un champ porté par le QR (source qr) — jamais re-questionné", () => {
    // applyQrBill marque montant_a_payer/devise/reference/iban en source "qr".
    const p = applyQrBill(emptyProposal(), validQr);
    // montant_a_payer est rattaché à la clé agrégée "montants" via la provenance fine "qr".
    // On vérifie que les champs de paiement déterministes ne sont jamais listés.
    const champs = champsACompleter(p);
    expect(champs).not.toContain("montant_a_payer");
    expect(champs).not.toContain("devise");
    expect(champs).not.toContain("reference");
  });

  it("renvoie [] quand tout est rempli et sûr", () => {
    const p = emptyProposal({
      numero_facture: "F-1",
      date_emission: "2026-01-01",
      date_echeance: "2026-02-01",
      total_ht: 100,
      total_tva: 8.1,
      total_ttc: 108.1,
      montant_a_payer: 108.1,
      taux_tva_principal: 8.1,
      categorie_comptable: "services",
      fournisseur: { ...emptyProposal().fournisseur, raison_sociale: "ACME" },
      confiance_par_champ: {
        fournisseur: { source: "ia", confiance: 0.9 },
        montants: { source: "ia", confiance: 0.9 },
      },
    });
    expect(champsACompleter(p)).toEqual([]);
  });
});

describe("fusionnerDeuxiemePasse (2e passe IA — ADR 0024 §6)", () => {
  it("adopte une valeur manquante comblée par la passe 2", () => {
    const pass1 = emptyProposal({
      numero_facture: null,
      confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.3 } },
    });
    const pass2 = emptyProposal({
      numero_facture: "F-2026-42",
      confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.8 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["numero_facture"]);
    expect(r.numero_facture).toBe("F-2026-42");
    expect(r.confiance_par_champ.fournisseur).toEqual({ source: "ia", confiance: 0.8 });
  });

  it("n'écrase JAMAIS un champ porté par le QR (montant)", () => {
    const pass1 = applyQrBill(emptyProposal(), validQr); // montant_a_payer = 1949.75 (qr)
    const pass2 = emptyProposal({
      montant_a_payer: 999,
      confiance_par_champ: { montants: { source: "ia", confiance: 1 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["montant_a_payer"]);
    expect(r.montant_a_payer).toBe(1949.75);
    expect(r.confiance_par_champ.montant_a_payer).toEqual({ source: "qr", confiance: 1 });
  });

  it("garde la passe 1 si la passe 2 n'apporte rien (valeur null)", () => {
    const pass1 = emptyProposal({
      total_ttc: 108.1,
      confiance_par_champ: { montants: { source: "ia", confiance: 0.5 } },
    });
    const pass2 = emptyProposal({
      total_ttc: null,
      confiance_par_champ: { montants: { source: "ia", confiance: 0.9 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["total_ttc"]);
    expect(r.total_ttc).toBe(108.1);
    expect(r.confiance_par_champ.montants).toEqual({ source: "ia", confiance: 0.5 });
  });

  it("garde la passe 1 si la passe 2 a une confiance inférieure (champ déjà rempli)", () => {
    const pass1 = emptyProposal({
      total_ttc: 108.1,
      confiance_par_champ: { montants: { source: "ia", confiance: 0.8 } },
    });
    const pass2 = emptyProposal({
      total_ttc: 200,
      confiance_par_champ: { montants: { source: "ia", confiance: 0.4 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["total_ttc"]);
    expect(r.total_ttc).toBe(108.1);
    expect(r.confiance_par_champ.montants).toEqual({ source: "ia", confiance: 0.8 });
  });

  it("comble l'identité fournisseur sans toucher à l'IBAN QR de la passe 1", () => {
    const pass1 = applyQrBill(
      emptyProposal({
        fournisseur: { ...emptyProposal().fournisseur, raison_sociale: null, iban: null },
        confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.2 } },
      }),
      validQr,
    );
    const pass2 = emptyProposal({
      fournisseur: { ...emptyProposal().fournisseur, raison_sociale: "Robert Schneider AG" },
      confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.9 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["fournisseur"]);
    expect(r.fournisseur.raison_sociale).toBe("Robert Schneider AG");
    // IBAN reste celui du QR (jamais touché par la fusion).
    expect(r.fournisseur.iban).toBe("CH4431999123000889012");
    expect(r.confiance_par_champ.iban).toEqual({ source: "qr", confiance: 1 });
  });

  it("déduplique les clés en entrée", () => {
    const pass1 = emptyProposal({ numero_facture: null });
    const pass2 = emptyProposal({
      numero_facture: "F-9",
      confiance_par_champ: { fournisseur: { source: "ia", confiance: 0.7 } },
    });
    const r = fusionnerDeuxiemePasse(pass1, pass2, ["numero_facture", "numero_facture"]);
    expect(r.numero_facture).toBe("F-9");
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
