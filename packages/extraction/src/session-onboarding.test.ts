// F6d — cycle de vie session onboarding (cœur pur).
import { describe, expect, it } from "vitest";
import { onboardingEstTermine } from "./session-onboarding";

describe("onboardingEstTermine", () => {
  it("vrai seulement pour le statut terminee", () => {
    expect(onboardingEstTermine("terminee")).toBe(true);
    expect(onboardingEstTermine("etape_3_en_cours")).toBe(false);
    expect(onboardingEstTermine("initialisee")).toBe(false);
    expect(onboardingEstTermine("abandonnee")).toBe(false);
  });
});
