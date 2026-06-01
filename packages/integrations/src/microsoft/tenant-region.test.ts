import { describe, expect, it } from "vitest";
import type { TenantRegionSignal } from "./region";
import { detectAndPersistTenantRegion, type TenantRegionResult } from "./tenant-region";

function fakeSource(signal: TenantRegionSignal) {
  return { getTenantRegionSignal: async () => signal };
}

function capture() {
  const calls: { cabinetId: string; verdict: TenantRegionResult }[] = [];
  return {
    persist: async (cabinetId: string, verdict: TenantRegionResult) => {
      calls.push({ cabinetId, verdict });
    },
    calls,
  };
}

describe("detectAndPersistTenantRegion (D3)", () => {
  it("tenant suisse → adéquat, verdict persisté avec checkedAt", async () => {
    const { persist, calls } = capture();
    const result = await detectAndPersistTenantRegion("cab-A", {
      source: fakeSource({ countryLetterCode: "CH", preferredDataLocation: null }),
      persist,
      now: () => 1_700_000_000_000,
    });
    expect(result.isAdequate).toBe(true);
    expect(result.checkedAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ cabinetId: "cab-A", verdict: { isAdequate: true } });
  });

  it("tenant US → non adéquat (déclenche l'avertissement en aval)", async () => {
    const { persist } = capture();
    const result = await detectAndPersistTenantRegion("cab-A", {
      source: fakeSource({ countryLetterCode: "US", preferredDataLocation: null }),
      persist,
      now: () => 1_700_000_000_000,
    });
    expect(result.isAdequate).toBe(false);
    expect(result.source).toBe("countryLetterCode");
  });
});
