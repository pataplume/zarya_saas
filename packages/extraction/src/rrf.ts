// H3a — Reciprocal Rank Fusion (RRF) : fusionne plusieurs listes classées (ex. vectorielle +
// full-text) en un classement unique. PUR. Réf : search.md §6.2 ; Cormack et al. 2009.
// Score d'un élément = Σ_listes 1 / (k + rang) (rang 1-based). k amortit le poids des 1res positions.

export const RRF_K = 60;

/**
 * Fusionne des listes d'ids classés (du plus pertinent au moins pertinent) en un classement
 * unique décroissant. Un id absent d'une liste n'y contribue pas. Ordre stable à score égal
 * (premier vu d'abord).
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  k: number = RRF_K,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank];
      if (id === undefined) continue;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    }
  }
  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));
}
