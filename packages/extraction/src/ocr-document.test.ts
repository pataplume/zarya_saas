import { type IkChatCompletionResponse, InfomaniakError } from "@zarya/integrations";
import { beforeEach, describe, expect, it, vi } from "vitest";

// On mocke @zarya/db pour observer les écritures invocation sans vraie base.
// `insert(...).values(...).returning(...)` est une chaîne fluent → on la simule.
// vi.hoisted : le mock est hissé au-dessus des imports, donc le spy doit l'être aussi.
const { insertedRows, insertSpy } = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const spy = vi.fn((_table: unknown) => ({
    values: (row: Record<string, unknown>) => {
      rows.push(row);
      return { returning: async () => [{ id: "inv-generated" }] };
    },
  }));
  return { insertedRows: rows, insertSpy: spy };
});

vi.mock("@zarya/db", () => ({
  db: { insert: insertSpy },
  invocation: { __table: "invocation" },
  propositionClassement: { __table: "proposition_classement" },
}));

import { ExtractionError } from "./classifier";
import type { VisionModelClient } from "./ocr";
import { ocrDocument } from "./ocr-document";

const VISION_MODEL = "mistralai/Mistral-Small-4-119B-2603";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function visionResponse(text: string): IkChatCompletionResponse {
  return {
    model: VISION_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 2200, completion_tokens: 130, total_tokens: 2330 },
  };
}

function visionClient(
  chat: VisionModelClient["chatCompletion"],
  resolve: VisionModelClient["resolveModel"] = async () => VISION_MODEL,
): VisionModelClient {
  return { resolveModel: resolve, chatCompletion: chat };
}

const BASE = { cabinet_id: "cab-A", fichier_physique_id: "fp-1", invoked_by_user_id: "user-1" };

beforeEach(() => {
  insertedRows.length = 0;
  insertSpy.mockClear();
});

describe("ocrDocument — traçabilité vision", () => {
  it("OCR vision → 1 invocation tracée, scopée cabinet_id, ocr_engine renseigné", async () => {
    const chat = vi.fn(async () => visionResponse("Facture 1234"));
    const res = await ocrDocument(
      { ...BASE, bytes: JPEG, type_mime: "image/jpeg", taille_octets: 1234 },
      visionClient(chat),
    );

    expect(res.source).toBe("vision");
    expect(res.ocr_text).toBe("Facture 1234");
    expect(res.invocation_id).toBe("inv-generated");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertedRows[0];
    expect(row?.cabinet_id).toBe("cab-A"); // isolation : jamais le cabinet d'un autre
    expect(row?.context).toBe("classification_doc");
    expect(row?.status).toBe("success");
    expect(row?.ocr_engine).toBe(VISION_MODEL);
    expect(row?.input_document_id).toBe("fp-1");
    expect(row?.tokens_input).toBe(2200);
    expect(row?.tokens_output).toBe(130);
  });
});

describe("ocrDocument — pas d'invocation pour le gratuit/déterministe", () => {
  it("type non-image (xlsx) → source aucune, AUCUNE invocation", async () => {
    const chat = vi.fn(async () => visionResponse("x"));
    const res = await ocrDocument(
      {
        ...BASE,
        bytes: new Uint8Array([1, 2, 3]),
        type_mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      visionClient(chat),
    );
    expect(res.source).toBe("aucune");
    expect(res.ocr_text).toBeNull();
    expect(res.invocation_id).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled(); // règle : texte gratuit ⇒ 0 invocation
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("ocrDocument — échecs vision", () => {
  it("rate_limit → relève RATE_LIMIT et trace un échec scopé cabinet_id", async () => {
    const chat = vi.fn(async () => {
      throw new InfomaniakError("rate_limit", "429");
    });
    const err = await ocrDocument(
      { ...BASE, bytes: JPEG, type_mime: "image/jpeg" },
      visionClient(chat),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe("RATE_LIMIT");
    // une ligne d'échec est tracée (best-effort), scopée au bon cabinet.
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertedRows[0]?.cabinet_id).toBe("cab-A");
    expect(insertedRows[0]?.status).toBe("rate_limit");
    expect(insertedRows[0]?.nb_items_extracted).toBe(0);
  });

  it("erreur générique → OCR_FAILED, échec tracé avec statut ocr_failed", async () => {
    const chat = vi.fn(async () => {
      throw new Error("502");
    });
    const err = await ocrDocument(
      { ...BASE, bytes: JPEG, type_mime: "image/jpeg" },
      visionClient(chat),
    ).catch((e) => e);

    expect((err as ExtractionError).code).toBe("OCR_FAILED");
    expect(insertedRows[0]?.status).toBe("ocr_failed");
  });
});
