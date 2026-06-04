import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf";

describe("reciprocalRankFusion", () => {
  it("liste vide → []", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("un id présent en tête des deux listes domine", () => {
    const r = reciprocalRankFusion([
      ["a", "b", "c"],
      ["a", "x", "y"],
    ]);
    expect(r[0]?.id).toBe("a");
    expect(r[0]?.score).toBeGreaterThan(r[1]?.score ?? 0);
  });

  it("additionne les contributions d'un id apparaissant dans plusieurs listes", () => {
    // 'b' : rang 2 (liste 1) + rang 1 (liste 2) ; 'c' : rang 3 (liste 1) seul → b > c.
    const r = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "d"],
    ]);
    const score = (id: string) => r.find((x) => x.id === id)?.score ?? 0;
    expect(score("b")).toBeGreaterThan(score("c"));
    expect(score("b")).toBeGreaterThan(score("d"));
  });

  it("k plus grand aplatit les écarts entre rangs", () => {
    const lists = [["a", "b"]];
    const small = reciprocalRankFusion(lists, 1);
    const large = reciprocalRankFusion(lists, 1000);
    const gapS = (small[0]?.score ?? 0) - (small[1]?.score ?? 0);
    const gapL = (large[0]?.score ?? 0) - (large[1]?.score ?? 0);
    expect(gapL).toBeLessThan(gapS);
  });
});
