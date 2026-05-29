// Test unitaire de la fonction pure de mapping erreur → statut d'invocation.
// La persistance (traceFailedInvocation) touche la DB et est couverte ailleurs
// (tests d'intégration) ; ici on ne valide que le mapping, sans I/O.

import { describe, expect, it } from "vitest";
import { ExtractionError } from "./classifier";
import { mapErrorToInvocationStatus } from "./classify-document";

describe("mapErrorToInvocationStatus", () => {
  it("RATE_LIMIT → rate_limit (429 après retries épuisés)", () => {
    expect(mapErrorToInvocationStatus(new ExtractionError("RATE_LIMIT", "quota"))).toBe(
      "rate_limit",
    );
  });

  it("TIMEOUT → timeout", () => {
    expect(mapErrorToInvocationStatus(new ExtractionError("TIMEOUT", "lent"))).toBe("timeout");
  });

  it("VALIDATION_FAILED → validation_error", () => {
    expect(mapErrorToInvocationStatus(new ExtractionError("VALIDATION_FAILED", "json"))).toBe(
      "validation_error",
    );
  });

  it("CONFIG et LLM_ERROR → unknown_error", () => {
    expect(mapErrorToInvocationStatus(new ExtractionError("CONFIG", "env"))).toBe("unknown_error");
    expect(mapErrorToInvocationStatus(new ExtractionError("LLM_ERROR", "boom"))).toBe(
      "unknown_error",
    );
  });

  it("erreur quelconque (non ExtractionError) → unknown_error", () => {
    expect(mapErrorToInvocationStatus(new Error("???"))).toBe("unknown_error");
    expect(mapErrorToInvocationStatus("string brute")).toBe("unknown_error");
  });
});
