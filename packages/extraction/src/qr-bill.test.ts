import { describe, expect, it } from "vitest";
import {
  decodeQrFromDocument,
  isQrIban,
  isValidCreditorReference,
  isValidIban,
  isValidQrReference,
  normalizeIban,
  parseSwissQrBill,
  type QrPayloadExtractor,
  unavailableQrPayloadExtractor,
} from "./qr-bill";

/**
 * Construit un payload SPC v0200 à partir de surcharges (le reste = exemple canonique SIX).
 * Layout v2.0 : 3 en-têtes, IBAN, 7 créancier, 7 créancier final (vides), montant, devise,
 * 7 débiteur final, type réf, réf, message, trailer EPD, billing info.
 */
function buildPayload(o: {
  header?: string;
  version?: string;
  iban?: string;
  amount?: string;
  currency?: string;
  refType?: string;
  reference?: string;
  truncate?: number;
  trailer?: string;
}): string {
  const fields = [
    o.header ?? "SPC",
    o.version ?? "0200",
    "1",
    o.iban ?? "CH4431999123000889012",
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
    o.amount ?? "1949.75",
    o.currency ?? "CHF",
    "S",
    "Pia-Maria Rutschmann-Schnyder",
    "Grosse Marktgasse",
    "28",
    "9400",
    "Rorschach",
    "CH",
    o.refType ?? "QRR",
    o.reference ?? "210000000003139471430009017",
    "Instruction of 15.09.2019",
    o.trailer ?? "EPD",
    "//S1/10/10201409/11/190512/20/1400.000-53",
  ];
  const sliced = o.truncate !== undefined ? fields.slice(0, o.truncate) : fields;
  return sliced.join("\n");
}

// IBAN standard (non-QR) valide pour les cas SCOR / NON.
const NORMAL_IBAN = "CH9300762011623852957";

describe("validators IBAN / QR-IBAN", () => {
  it("valide un IBAN suisse correct (mod-97)", () => {
    expect(isValidIban("CH4431999123000889012")).toBe(true);
    expect(isValidIban(NORMAL_IBAN)).toBe(true);
  });

  it("rejette un IBAN au checksum faux", () => {
    expect(isValidIban("CH4431999123000889013")).toBe(false);
    expect(isValidIban("FR00")).toBe(false);
  });

  it("normalise espaces et casse", () => {
    expect(normalizeIban("ch44 3199 9123 0008 8901 2")).toBe("CH4431999123000889012");
  });

  it("détecte un QR-IBAN (IID 30000–31999) vs un IBAN standard", () => {
    expect(isQrIban("CH4431999123000889012")).toBe(true); // IID 31999
    expect(isQrIban(NORMAL_IBAN)).toBe(false); // IID 00762
  });
});

describe("validators de référence", () => {
  it("valide une référence QRR (27 chiffres + mod-10 récursif)", () => {
    expect(isValidQrReference("210000000003139471430009017")).toBe(true);
  });

  it("rejette une QRR au check digit faux ou de mauvaise longueur", () => {
    expect(isValidQrReference("210000000003139471430009018")).toBe(false);
    expect(isValidQrReference("2100000000031394714300090")).toBe(false);
    expect(isValidQrReference("21000000000313947143000901X")).toBe(false);
  });

  it("valide une référence créancier SCOR (ISO 11649)", () => {
    expect(isValidCreditorReference("RF18539007547034")).toBe(true);
  });

  it("rejette une SCOR au checksum faux", () => {
    expect(isValidCreditorReference("RF19539007547034")).toBe(false);
    expect(isValidCreditorReference("539007547034")).toBe(false);
  });
});

describe("parseSwissQrBill — chemin nominal", () => {
  it("parse + valide un QR-bill QRR complet", () => {
    const r = parseSwissQrBill(buildPayload({}));
    expect(r.isSwissQrBill).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.data).not.toBeNull();
    expect(r.data?.iban).toBe("CH4431999123000889012");
    expect(r.data?.amount).toBe(1949.75);
    expect(r.data?.currency).toBe("CHF");
    expect(r.data?.reference).toEqual({
      type: "QRR",
      value: "210000000003139471430009017",
    });
    expect(r.data?.creditor.name).toBe("Robert Schneider AG");
    expect(r.data?.ultimateDebtor?.name).toBe("Pia-Maria Rutschmann-Schnyder");
    expect(r.data?.ultimateCreditor).toBeNull(); // 7 champs vides → null
    expect(r.data?.billingInfo).toContain("//S1/");
    expect(r.validations.every((v) => v.ok)).toBe(true);
  });

  it("accepte CRLF et un montant vide (facture ouverte)", () => {
    const payload = buildPayload({ amount: "" }).replace(/\n/g, "\r\n");
    const r = parseSwissQrBill(payload);
    expect(r.valid).toBe(true);
    expect(r.data?.amount).toBeNull();
  });

  it("parse un IBAN standard + SCOR", () => {
    const r = parseSwissQrBill(
      buildPayload({ iban: NORMAL_IBAN, refType: "SCOR", reference: "RF18539007547034" }),
    );
    expect(r.valid).toBe(true);
    expect(r.data?.reference.type).toBe("SCOR");
  });

  it("parse un IBAN standard + NON (sans référence)", () => {
    const r = parseSwissQrBill(buildPayload({ iban: NORMAL_IBAN, refType: "NON", reference: "" }));
    expect(r.valid).toBe(true);
    expect(r.data?.reference).toEqual({ type: "NON", value: null });
  });
});

describe("parseSwissQrBill — détection & erreurs", () => {
  it("n'est pas un QR-bill si l'en-tête ≠ SPC", () => {
    const r = parseSwissQrBill("https://example.com/qr");
    expect(r.isSwissQrBill).toBe(false);
    expect(r.data).toBeNull();
    expect(r.valid).toBe(false);
  });

  it("data=null + invalide si le payload est tronqué (trailer absent)", () => {
    const r = parseSwissQrBill(buildPayload({ truncate: 20 }));
    expect(r.isSwissQrBill).toBe(true);
    expect(r.data).toBeNull();
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "structure.fields")?.ok).toBe(false);
  });

  it("invalide si le trailer ≠ EPD", () => {
    const r = parseSwissQrBill(buildPayload({ trailer: "XXX" }));
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "structure.trailer")?.ok).toBe(false);
  });

  it("invalide si le checksum IBAN est faux", () => {
    const r = parseSwissQrBill(buildPayload({ iban: "CH4431999123000889013" }));
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "iban.checksum")?.ok).toBe(false);
  });

  it("invalide si la référence QRR a un mauvais checksum", () => {
    const r = parseSwissQrBill(buildPayload({ reference: "210000000003139471430009018" }));
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "reference.qrr")?.ok).toBe(false);
  });

  it("incohérence : QR-IBAN avec référence NON", () => {
    const r = parseSwissQrBill(buildPayload({ refType: "NON", reference: "" }));
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "reference.coherence")?.ok).toBe(false);
  });

  it("incohérence : IBAN standard avec référence QRR", () => {
    const r = parseSwissQrBill(buildPayload({ iban: NORMAL_IBAN }));
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "reference.coherence")?.ok).toBe(false);
  });

  it("invalide si le montant est négatif ou non numérique", () => {
    expect(parseSwissQrBill(buildPayload({ amount: "-5" })).valid).toBe(false);
    expect(parseSwissQrBill(buildPayload({ amount: "abc" })).valid).toBe(false);
  });
});

describe("seam image (couche 1 différée — ADR 0020)", () => {
  it("l'extracteur par défaut ne fournit aucun payload", async () => {
    await expect(unavailableQrPayloadExtractor({ storagePath: "x" })).resolves.toBeNull();
  });

  it("decodeQrFromDocument sans extracteur câblé → pas de QR-bill (fallback IA)", async () => {
    const r = await decodeQrFromDocument({ storagePath: "facture.pdf" });
    expect(r.isSwissQrBill).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.validations.find((v) => v.check === "image.payload")?.ok).toBe(false);
  });

  it("decodeQrFromDocument avec un extracteur câblé parse le payload", async () => {
    const extractor: QrPayloadExtractor = async () => buildPayload({});
    const r = await decodeQrFromDocument({ storagePath: "facture.pdf" }, extractor);
    expect(r.isSwissQrBill).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.data?.iban).toBe("CH4431999123000889012");
  });
});
