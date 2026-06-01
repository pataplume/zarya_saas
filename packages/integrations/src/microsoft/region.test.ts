import { describe, expect, it } from "vitest";
import { classifyTenantRegion } from "./region";

describe("classifyTenantRegion (D3) — zone OK = UE/EEE + Suisse + adéquats", () => {
  it("countryLetterCode suisse → adéquat (cible n°1, pas bloquée)", () => {
    const v = classifyTenantRegion({ countryLetterCode: "CH", preferredDataLocation: null });
    expect(v).toEqual({
      countryCode: "CH",
      dataLocation: null,
      source: "countryLetterCode",
      isAdequate: true,
    });
  });

  it("countryLetterCode UE (FR) → adéquat", () => {
    expect(
      classifyTenantRegion({ countryLetterCode: "FR", preferredDataLocation: null }).isAdequate,
    ).toBe(true);
  });

  it("countryLetterCode UK (GB) → adéquat", () => {
    expect(
      classifyTenantRegion({ countryLetterCode: "GB", preferredDataLocation: null }).isAdequate,
    ).toBe(true);
  });

  it("countryLetterCode US → NON adéquat (avertissement)", () => {
    const v = classifyTenantRegion({ countryLetterCode: "US", preferredDataLocation: null });
    expect(v.isAdequate).toBe(false);
    expect(v.source).toBe("countryLetterCode");
  });

  it("preferredDataLocation est prioritaire sur countryLetterCode", () => {
    // Org déclarée US mais données Multi-Geo en Europe → adéquat via data location.
    const v = classifyTenantRegion({ countryLetterCode: "US", preferredDataLocation: "EUR" });
    expect(v).toEqual({
      countryCode: "US",
      dataLocation: "EUR",
      source: "preferredDataLocation",
      isAdequate: true,
    });
  });

  it("preferredDataLocation NAM → NON adéquat même si org FR", () => {
    const v = classifyTenantRegion({ countryLetterCode: "FR", preferredDataLocation: "NAM" });
    expect(v.isAdequate).toBe(false);
    expect(v.source).toBe("preferredDataLocation");
  });

  it("geo Multi-Geo suisse (CHE) → adéquat", () => {
    expect(
      classifyTenantRegion({ countryLetterCode: null, preferredDataLocation: "CHE" }).isAdequate,
    ).toBe(true);
  });

  it("normalise la casse (minuscules)", () => {
    expect(
      classifyTenantRegion({ countryLetterCode: "ch", preferredDataLocation: null }).isAdequate,
    ).toBe(true);
    expect(
      classifyTenantRegion({ countryLetterCode: null, preferredDataLocation: "eur" }).isAdequate,
    ).toBe(true);
  });

  it("aucun signal → unknown + NON adéquat (conservateur → on avertit)", () => {
    const v = classifyTenantRegion({ countryLetterCode: null, preferredDataLocation: null });
    expect(v).toEqual({
      countryCode: null,
      dataLocation: null,
      source: "unknown",
      isAdequate: false,
    });
  });
});
