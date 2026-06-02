// F6b — Extraction des employés depuis un fichier parsé (onboarding-client §3).
//
// Stratégie : pour les fichiers STRUCTURÉS (.xlsx/CSV avec en-têtes reconnus), l'extraction
// est DÉTERMINISTE (mapping colonne→champ, confiance 1.0 par cellule lue) — aucune dépendance
// LLM, aucun coût, aucune hallucination. C'est le cas primaire (exports Bexio/Crésus, doc §4).
//
// La voie LLM `chat_large` (uploads NON structurés : PDF/scan, en-têtes non reconnus) est
// exposée par le contrat `EmployesExtractor` mais son implémentation Infomaniak est DIFFÉRÉE :
// elle suppose l'OCR `vision` (texte des scans), lui-même différé (KICKOFF F6 / pré-requis E/F).
// La câbler maintenant produirait du code mort non testable. `getEmployesExtractor` renvoie donc
// l'extracteur déterministe ; le mode manuel couvre la saisie directe.
//
// PUR (hors I/O). Réf : docs/data-model/onboarding-client-schema.md §6-7 ; ADR 0007.

import {
  CATEGORIE_PAR_CHAMP,
  type CategorieChamp,
  CHAMPS_OBLIGATOIRES_SWISSDEC,
  NOMS_CHAMP,
  type NomChamp,
} from "./employe-fields";
import type { LigneEmploye } from "./parse-employes-file";

export type ExtractionMode = "stub" | "live";

/** Un champ proposé pour un employé (→ salaire.proposition_champ). */
export interface ChampPropose {
  nom_champ: NomChamp;
  categorie: CategorieChamp;
  /** Valeur extraite (clair). Pour les champs sensibles, le pipeline la chiffre au Vault. */
  valeur_proposee: string | null;
  confiance: number;
  source_cellule?: string;
  obligatoire_swissdec: boolean;
  /** 'propose' si extraite, 'manquant' si obligatoire-Swissdec absente. */
  statut: "propose" | "manquant";
}

/** Une proposition d'employé (→ salaire.proposition_employe + ses champs). */
export interface EmployeProposal {
  /** Ordre dans le fichier source (1-indexé). */
  numero_dans_extraction: number;
  confiance_globale: number;
  champs: ChampPropose[];
  anomalies: string[];
}

export interface EmployesExtractionInput {
  nom_fichier: string;
  lignes: LigneEmploye[];
}

export interface EmployesExtractionResult {
  employes: EmployeProposal[];
  mode: ExtractionMode;
  modele_utilise: "chat_large" | "chat_small" | "vision" | "autre";
  prompt_version: string;
  nb_employes_detectes: number;
  confiance_globale: number;
}

export interface EmployesExtractor {
  readonly mode: ExtractionMode;
  extract(input: EmployesExtractionInput): Promise<EmployesExtractionResult>;
}

export const DETERMINISTE_PROMPT_VERSION = "deterministe-employes-v1";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/** Construit la liste complète des champs proposés d'une ligne (incl. manquants Swissdec). */
function champsDepuisLigne(ligne: LigneEmploye): ChampPropose[] {
  const champs: ChampPropose[] = [];
  for (const nom of NOMS_CHAMP) {
    const cell = ligne[nom];
    const obligatoire = CHAMPS_OBLIGATOIRES_SWISSDEC.has(nom);
    if (cell) {
      champs.push({
        nom_champ: nom,
        categorie: CATEGORIE_PAR_CHAMP[nom],
        valeur_proposee: cell.valeur,
        confiance: 1, // lecture déterministe d'une cellule reconnue
        source_cellule: cell.source_cellule,
        obligatoire_swissdec: obligatoire,
        statut: "propose",
      });
    } else if (obligatoire) {
      // Champ obligatoire absent → ligne 'manquant' pour forcer la saisie à la validation.
      champs.push({
        nom_champ: nom,
        categorie: CATEGORIE_PAR_CHAMP[nom],
        valeur_proposee: null,
        confiance: 0,
        obligatoire_swissdec: true,
        statut: "manquant",
      });
    }
  }
  return champs;
}

/** Confiance globale d'une proposition = moyenne des confiances de ses champs. */
function confianceGlobale(champs: ChampPropose[]): number {
  if (champs.length === 0) return 0;
  const somme = champs.reduce((acc, c) => acc + c.confiance, 0);
  return clamp01(somme / champs.length);
}

/** Anomalies déterministes minimales (les règles fines = validation F6c). */
function anomaliesLigne(champs: ChampPropose[]): string[] {
  const anomalies: string[] = [];
  const manquants = champs.filter((c) => c.statut === "manquant").map((c) => c.nom_champ);
  if (manquants.length > 0) anomalies.push(`champs_obligatoires_manquants:${manquants.join(",")}`);
  return anomalies;
}

/** Extracteur déterministe : lignes structurées → propositions. PUR. */
export class DeterministicEmployesExtractor implements EmployesExtractor {
  readonly mode: ExtractionMode = "stub";

  async extract(input: EmployesExtractionInput): Promise<EmployesExtractionResult> {
    const employes: EmployeProposal[] = input.lignes.map((ligne, i) => {
      const champs = champsDepuisLigne(ligne);
      return {
        numero_dans_extraction: i + 1,
        confiance_globale: confianceGlobale(champs),
        champs,
        anomalies: anomaliesLigne(champs),
      };
    });
    const confiance =
      employes.length === 0
        ? 0
        : clamp01(employes.reduce((a, e) => a + e.confiance_globale, 0) / employes.length);
    return {
      employes,
      mode: "stub",
      modele_utilise: "autre",
      prompt_version: DETERMINISTE_PROMPT_VERSION,
      nb_employes_detectes: employes.length,
      confiance_globale: confiance,
    };
  }
}

/**
 * Sélectionne l'extracteur. La voie LLM `live` (chat_large) est différée (cf. en-tête) ;
 * on renvoie l'extracteur déterministe dans les deux modes. Quand l'OCR vision sera câblé,
 * un InfomaniakEmployesExtractor (texte non structuré) sera branché ici en mode `live`.
 */
export function getEmployesExtractor(_mode: ExtractionMode = "stub"): EmployesExtractor {
  return new DeterministicEmployesExtractor();
}

// ─── Mode manuel — saisie directe d'un employé (sans fichier ni extraction) ──────

export type SaisieManuelle = Partial<Record<NomChamp, string>>;

/**
 * Construit une proposition d'employé à partir d'une saisie manuelle. PUR. Les champs saisis
 * portent une confiance 1 (saisie humaine) ; les obligatoires-Swissdec absents → 'manquant'.
 */
export function buildManualProposal(saisie: SaisieManuelle, numero = 1): EmployeProposal {
  const ligne: LigneEmploye = {};
  for (const nom of NOMS_CHAMP) {
    const v = saisie[nom];
    if (v !== undefined && v.trim() !== "")
      ligne[nom] = { valeur: v.trim(), source_cellule: "saisie" };
  }
  const champs = champsDepuisLigne(ligne);
  return {
    numero_dans_extraction: numero,
    confiance_globale: confianceGlobale(champs),
    champs,
    anomalies: anomaliesLigne(champs),
  };
}
