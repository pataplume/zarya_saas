// Comparaison proposition IA ↔ valeurs retenues par l'humain à la validation.
//
// Pure (aucun import DB) → testable en isolation. Sert à déterminer si la
// validation est conforme à la proposition (valide_humain) ou si l'humain a
// corrigé au moins un champ (corrige_humain), et à journaliser le détail des
// corrections (feedback prompt, doc.md § 7.3 / extraction-ia.md § 12).

// Champs comparés à la validation (sous-ensemble corrigeable, doc.md § 7.3).
const CHAMPS = ["client_id", "type", "categorie", "periode", "libelle"] as const;
export type ChampValidation = (typeof CHAMPS)[number];

export type ChampsProposition = Record<ChampValidation, string | null>;

export interface ValidationDiff {
  corrige: boolean;
  corrections: Partial<Record<ChampValidation, { propose: string | null; retenu: string | null }>>;
}

// Normalise pour comparer : null et "" sont équivalents (champ vide).
function vide(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export function diffValidation(
  propose: ChampsProposition,
  retenu: ChampsProposition,
): ValidationDiff {
  const corrections: ValidationDiff["corrections"] = {};
  for (const champ of CHAMPS) {
    const p = vide(propose[champ]);
    const r = vide(retenu[champ]);
    if (p !== r) corrections[champ] = { propose: p, retenu: r };
  }
  return { corrige: Object.keys(corrections).length > 0, corrections };
}
