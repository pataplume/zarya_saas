import { describe, expect, it, vi } from "vitest";
import { MicrosoftGraphError } from "./errors";
import type { SendEmailParams } from "./graph-types";
import { applySignature, sendCabinetEmail } from "./send-email";

describe("applySignature (D5)", () => {
  it("sans signature → corps inchangé", () => {
    expect(applySignature("Bonjour", undefined, "Text")).toBe("Bonjour");
  });
  it("texte → double saut de ligne", () => {
    expect(applySignature("Bonjour", "Cabinet X", "Text")).toBe("Bonjour\n\nCabinet X");
  });
  it("HTML → deux <br>", () => {
    expect(applySignature("<p>Bonjour</p>", "<b>Cabinet X</b>", "HTML")).toBe(
      "<p>Bonjour</p><br><br><b>Cabinet X</b>",
    );
  });
});

describe("sendCabinetEmail (D5)", () => {
  it("succès → 'sent', signature apposée au corps envoyé", async () => {
    const sendEmail = vi.fn(async (_p: SendEmailParams) => {});
    const res = await sendCabinetEmail(
      "cab-A",
      {
        to: ["client@pme.ch"],
        subject: "Relance TVA",
        body: "Merci de transmettre vos pièces.",
        signature: "— Fiduciaire X",
      },
      { client: { sendEmail } },
    );
    expect(res).toEqual({ status: "sent" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0]?.[0];
    expect(sent?.body).toBe("Merci de transmettre vos pièces.\n\n— Fiduciaire X");
    expect(sent?.to).toEqual(["client@pme.ch"]);
  });

  it("token révoqué (401) → 'revoked' (reconnexion requise), ne lève pas", async () => {
    const sendEmail = vi.fn(async () => {
      throw new MicrosoftGraphError("revoked", "token mort");
    });
    const res = await sendCabinetEmail(
      "cab-A",
      { to: ["x@y.ch"], subject: "S", body: "B" },
      { client: { sendEmail } },
    );
    expect(res).toEqual({ status: "revoked" });
  });

  it("autre erreur Graph → 'error' avec le code, ne lève pas", async () => {
    const sendEmail = vi.fn(async () => {
      throw new MicrosoftGraphError("api_error", "boom");
    });
    const res = await sendCabinetEmail(
      "cab-A",
      { to: ["x@y.ch"], subject: "S", body: "B" },
      { client: { sendEmail } },
    );
    expect(res).toEqual({ status: "error", code: "api_error" });
  });

  it("erreur non typée → 'error' générique", async () => {
    const sendEmail = vi.fn(async () => {
      throw new Error("réseau");
    });
    const res = await sendCabinetEmail(
      "cab-A",
      { to: ["x@y.ch"], subject: "S", body: "B" },
      { client: { sendEmail } },
    );
    expect(res).toEqual({ status: "error", code: "error" });
  });
});
