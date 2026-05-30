// Barème de scoring du risque client (B5, ADR 0015). Cœur PUR (aucune I/O DB) →
// testable isolément et réutilisable par Calendar/C4 (recalcul sur transition d'échéance).
//
// ⚠️ BARÈME PROVISOIRE `v1` — heuristique MVP NON calibrée sur données fiduciaires réelles
// (acceptée founder « OK tant que noté »). Poids/seuils à recalibrer ; `facteurs.version`
// permet l'évolution sans migration. Voir ADR 0015 + KICKOFF §7 arbitrage #9.

export const BAREME_RISQUE_VERSION = "v1";

// Poids par signal (tous issus de colonnes du schéma scellé Bloc A — aucune donnée nouvelle).
export const POIDS_ECHEANCE_EN_RETARD = 25;
export const POIDS_DOCUMENT_EN_RETARD = 20;
export const POIDS_DOCUMENT_MANQUANT = 10;

// Seuil de bascule en `critique` (score ≥ seuil). En dessous et > 0 → `surveillance` ; 0 → `ok`.
export const SEUIL_RISQUE_CRITIQUE = 50;

export type NiveauRisque = "ok" | "surveillance" | "critique";

export interface RisqueSignals {
  // crm.echeance statut='en_retard' (non archivée), scopé cabinet+client.
  nb_echeances_en_retard: number;
  // crm.document_attendu statut_periode_courante='en_retard' (actif, non archivé).
  nb_documents_en_retard: number;
  // crm.document_attendu statut_periode_courante='manquant' (actif, non archivé).
  nb_documents_manquants: number;
}

export interface RisqueFacteurs extends RisqueSignals {
  version: string;
  score: number;
  niveau: NiveauRisque;
  calcule_le: string;
}

export interface RisqueScore {
  score: number; // 0-100
  niveau: NiveauRisque;
  drapeau_critique: boolean;
  // Renseigné uniquement quand le drapeau critique est levé (explique le drapeau) ; sinon null.
  drapeau_motif: string | null;
  facteurs: RisqueFacteurs;
}

function motifCritique(s: RisqueSignals): string {
  const parts: string[] = [];
  if (s.nb_echeances_en_retard > 0) parts.push(`${s.nb_echeances_en_retard} échéance(s) en retard`);
  if (s.nb_documents_en_retard > 0) parts.push(`${s.nb_documents_en_retard} document(s) en retard`);
  if (s.nb_documents_manquants > 0)
    parts.push(`${s.nb_documents_manquants} document(s) manquant(s)`);
  return parts.join(" · ");
}

// Calcule score (0-100, plafonné), niveau, drapeau et facteurs à partir des signaux.
// `now` injectable pour des tests déterministes.
export function computeScoreRisque(signals: RisqueSignals, now: Date = new Date()): RisqueScore {
  const score = Math.min(
    100,
    POIDS_ECHEANCE_EN_RETARD * signals.nb_echeances_en_retard +
      POIDS_DOCUMENT_EN_RETARD * signals.nb_documents_en_retard +
      POIDS_DOCUMENT_MANQUANT * signals.nb_documents_manquants,
  );

  const niveau: NiveauRisque =
    score === 0 ? "ok" : score >= SEUIL_RISQUE_CRITIQUE ? "critique" : "surveillance";

  const drapeau_critique = niveau === "critique";

  return {
    score,
    niveau,
    drapeau_critique,
    drapeau_motif: drapeau_critique ? motifCritique(signals) : null,
    facteurs: {
      version: BAREME_RISQUE_VERSION,
      nb_echeances_en_retard: signals.nb_echeances_en_retard,
      nb_documents_en_retard: signals.nb_documents_en_retard,
      nb_documents_manquants: signals.nb_documents_manquants,
      score,
      niveau,
      calcule_le: now.toISOString(),
    },
  };
}
