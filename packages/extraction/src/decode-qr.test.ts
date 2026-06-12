// Lot 1 — lecteur d'image QR-bill (decode-qr.ts).
//
// Vérifie le contrat octets → payload : un PNG encodant un payload SPC valide est lu et rend
// EXACTEMENT la chaîne SPC (que parseSwissQrBill valide ensuite). Best-effort : une image sans
// QR ou des octets corrompus renvoient null SANS lever.
//
// Le PNG de test est généré au runtime avec `qrcode` (devDependency) à partir du payload SPC
// canonique SIX réutilisé du décodeur déterministe (cf. qr-bill.test.ts buildPayload).

import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { decodeQrFromImageBytes } from "./decode-qr";
import { parseSwissQrBill } from "./qr-bill";

// Même payload SPC QRR canonique que qr-bill.test.ts (QR-IBAN CH44…889012, montant 1949.75).
const VALID_SPC_PAYLOAD = [
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

/** Génère un PNG (Uint8Array) encodant `text` en QR. Marge + échelle confortables pour jsQR. */
async function qrPng(text: string): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 6,
  });
  return new Uint8Array(buf);
}

/** Génère un PNG uni (sans QR) via @napi-rs/canvas, pour le cas « image sans QR ». */
async function plainPng(): Promise<Uint8Array> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(120, 120);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 120, 120);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

describe("decodeQrFromImageBytes — chemin nominal (image)", () => {
  it("lit un PNG QR et rend EXACTEMENT le payload SPC, parsable + valide", async () => {
    const png = await qrPng(VALID_SPC_PAYLOAD);

    const payload = await decodeQrFromImageBytes(png, "image/png");
    expect(payload).toBe(VALID_SPC_PAYLOAD);

    // Le payload extrait est bien un QR-bill suisse valide.
    const parsed = parseSwissQrBill(payload ?? "");
    expect(parsed.isSwissQrBill).toBe(true);
    expect(parsed.valid).toBe(true);
    expect(parsed.data?.iban).toBe("CH4431999123000889012");
    expect(parsed.data?.amount).toBe(1949.75);
  });
});

describe("decodeQrFromImageBytes — best-effort (jamais de throw)", () => {
  it("renvoie null pour une image sans QR", async () => {
    const png = await plainPng();
    await expect(decodeQrFromImageBytes(png, "image/png")).resolves.toBeNull();
  });

  it("renvoie null pour des octets corrompus (pas de throw)", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x42, 0x13]);
    await expect(decodeQrFromImageBytes(garbage, "image/png")).resolves.toBeNull();
  });

  it("renvoie null pour un type MIME non géré (xlsx)", async () => {
    const png = await qrPng(VALID_SPC_PAYLOAD);
    await expect(
      decodeQrFromImageBytes(
        png,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).resolves.toBeNull();
  });
});
