import { type IkChatCompletionResponse, InfomaniakError } from "@zarya/integrations";
import { describe, expect, it, vi } from "vitest";
import { ExtractionError } from "./classifier";
import { extractText, type VisionModelClient } from "./ocr";

const VISION_MODEL = "mistralai/Mistral-Small-4-119B-2603";

function visionResponse(text: string): IkChatCompletionResponse {
  return {
    model: VISION_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 2200, completion_tokens: 120, total_tokens: 2320 },
  };
}

function makeVisionClient(
  chat: VisionModelClient["chatCompletion"],
  resolve: VisionModelClient["resolveModel"] = async () => VISION_MODEL,
): VisionModelClient {
  return { resolveModel: resolve, chatCompletion: chat };
}

// Un PDF minimal réel n'est pas nécessaire : on injecte rarement ; ici on teste le
// ROUTAGE. Pour le chemin PDF on s'appuie sur le vrai unpdf via des bytes invalides
// → mais on veut éviter ça. On teste donc le routage PDF via un type/texte contrôlé.
// Les bytes PDF réels sont couverts par pdf-text.test.ts ; ici on cible la décision.

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // entête JPEG

describe("extractText — routage image → vision", () => {
  it("image JPEG → appelle la vision et renvoie le texte transcrit + usage", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () =>
      visionResponse("Facture Swisscom\nMontant: 89.00 CHF"),
    );
    const res = await extractText(
      { cabinet_id: "cab-1", bytes: JPEG_BYTES, type_mime: "image/jpeg" },
      makeVisionClient(chat),
    );

    expect(res.source).toBe("vision");
    expect(res.text).toContain("Swisscom");
    expect(res.model_used).toBe(VISION_MODEL);
    expect(res.usage).toEqual({ tokens_input: 2200, tokens_output: 120 });
    expect(res.needs_image_ocr).toBe(false);
    expect(typeof res.vision_duration_ms).toBe("number");

    // Le message user doit être multimodal (texte + image_url data URL base64).
    expect(chat).toHaveBeenCalledTimes(1);
    const params = chat.mock.calls[0]?.[0];
    const userMsg = params?.messages.find((m) => m.role === "user");
    expect(Array.isArray(userMsg?.content)).toBe(true);
    const parts = userMsg?.content as Array<{ type: string; image_url?: { url: string } }>;
    const img = parts.find((p) => p.type === "image_url");
    expect(img?.image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("image sans client vision → ExtractionError CONFIG (pas d'appel)", async () => {
    const err = await extractText({
      cabinet_id: "cab-1",
      bytes: JPEG_BYTES,
      type_mime: "image/png",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe("CONFIG");
  });

  it("rate_limit côté vision → ExtractionError RATE_LIMIT", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () => {
      throw new InfomaniakError("rate_limit", "429");
    });
    const err = await extractText(
      { cabinet_id: "cab-1", bytes: JPEG_BYTES, type_mime: "image/jpeg" },
      makeVisionClient(chat),
    ).catch((e) => e);
    expect((err as ExtractionError).code).toBe("RATE_LIMIT");
  });

  it("erreur vision générique → ExtractionError OCR_FAILED", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () => {
      throw new Error("502 bad gateway");
    });
    const err = await extractText(
      { cabinet_id: "cab-1", bytes: JPEG_BYTES, type_mime: "image/jpeg" },
      makeVisionClient(chat),
    ).catch((e) => e);
    expect((err as ExtractionError).code).toBe("OCR_FAILED");
  });

  it("resolveModel('vision') échoue (config) → CONFIG, sans appel chat", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () => visionResponse("x"));
    const resolve = vi.fn<VisionModelClient["resolveModel"]>(async () => {
      throw new InfomaniakError("config", "IK_MODEL_VISION absent");
    });
    const err = await extractText(
      { cabinet_id: "cab-1", bytes: JPEG_BYTES, type_mime: "image/jpeg" },
      makeVisionClient(chat, resolve),
    ).catch((e) => e);
    expect((err as ExtractionError).code).toBe("CONFIG");
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("extractText — types non-image", () => {
  it("type non géré (xlsx) → source aucune, aucun texte, pas d'erreur", async () => {
    const res = await extractText({
      cabinet_id: "cab-1",
      bytes: new Uint8Array([1, 2, 3]),
      type_mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(res.source).toBe("aucune");
    expect(res.text).toBe("");
    expect(res.needs_image_ocr).toBe(false);
  });
});

describe("extractText — routage PDF natif vs scanné", () => {
  // PDF texte minimal réel (unpdf le lit). Construit en latin1.
  function pdfWithText(content: string): Uint8Array {
    const body = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 80>>stream
BT /F1 18 Tf 20 100 Td (${content}) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
    return new Uint8Array(Buffer.from(body, "latin1"));
  }

  it("PDF avec texte natif dense → source pdf_natif, pas de vision", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () => visionResponse("NON"));
    const longText = "Facture fournisseur Swisscom montant total 1234 CHF echeance 2026";
    const res = await extractText(
      { cabinet_id: "cab-1", bytes: pdfWithText(longText), type_mime: "application/pdf" },
      makeVisionClient(chat),
      { quality: { minCharsPerPage: 20 } },
    );
    expect(res.source).toBe("pdf_natif");
    expect(res.text).toContain("Swisscom");
    expect(res.needs_image_ocr).toBe(false);
    expect(chat).not.toHaveBeenCalled(); // texte natif suffisant → aucun LLM
  });

  it("PDF scanné (texte natif insuffisant) → needs_image_ocr, source aucune", async () => {
    const chat = vi.fn<VisionModelClient["chatCompletion"]>(async () => visionResponse("x"));
    // Seuil élevé pour forcer l'échec de la porte qualité sur un texte court.
    const res = await extractText(
      { cabinet_id: "cab-1", bytes: pdfWithText("x"), type_mime: "application/pdf" },
      makeVisionClient(chat),
      { quality: { minCharsPerPage: 5000 } },
    );
    expect(res.source).toBe("aucune");
    expect(res.needs_image_ocr).toBe(true);
    expect(chat).not.toHaveBeenCalled(); // rasterisation différée, pas d'appel vision
  });
});
