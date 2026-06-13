// Brique d'extraction de facture fournisseur (contexte `facture`, Bloc E3a).
//
// Stratégie identique au Classifier : un seul contrat `FactureExtractor` derrière le
// flag EXTRACTION_MODE.
//  - mode "stub"  : proposition déterministe minimale (aucun appel réseau) ; renseigne
//                   tout de même les données de PAIEMENT depuis le QR-bill s'il est fourni.
//  - mode "live"  : Infomaniak AI Services (catégorie chat_large) — ADR 0010.
//                   Implémentation : ./infomaniak-facture-extractor.
//
// QR-FIRST (ADR 0020) : les champs de paiement (IBAN, montant, devise, référence) viennent
// du QR-bill décodé (E2) quand il est présent et valide, et ÉCRASENT la sortie IA — jamais
// de transcription IA d'un IBAN/montant quand le QR fournit la donnée déterministe.
//
// Ce fichier ne fait aucun appel réseau (la persistance proposition_facture = E3b, l'appel
// LLM = infomaniak-facture-extractor). Le cœur (applyQrBill, toFactureProposal) est PUR.

import { type ExtractionMode, resolveExtractionMode } from "./classifier";
import { detectFactureAnomalies } from "./detect-facture-anomalies";
import { InfomaniakFactureExtractor } from "./infomaniak-facture-extractor";
import { type DEVISES, FACTURE_PROMPT_VERSION } from "./prompts/facture";
import type { QrBillDecodeResult, SwissQrBill } from "./qr-bill";

export type Devise = (typeof DEVISES)[number];

/** Provenance d'un champ proposé (ADR 0024) : QR = déterministe/sûr, IA = à confirmer. */
export type SourceChamp = "qr" | "ia" | "humain";

/** Provenance + confiance d'UN champ proposé. */
export interface ConfianceChamp {
  /** D'où vient la valeur : "qr" (sûr), "ia" (à confirmer), "humain" (réservé/forward-compat). */
  source: SourceChamp;
  /** Confiance [0..1] sur ce champ. */
  confiance: number;
}

/** Identité de fournisseur proposée (l'IBAN peut provenir du QR-bill). */
export interface FactureFournisseurProposal {
  raison_sociale: string | null;
  ide: string | null;
  numero_tva: string | null;
  iban: string | null;
  bic: string | null;
  adresse: string | null;
}

/** Proposition d'extraction de facture (MVP : totaux, pas de lignes de détail). */
export interface FactureProposal {
  fournisseur: FactureFournisseurProposal;
  numero_facture: string | null;
  date_emission: string | null;
  date_echeance: string | null;
  reference: string | null;
  devise: Devise;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
  montant_a_payer: number | null;
  taux_tva_principal: number | null;
  categorie_comptable: string | null;
  /** `true` si un QR-bill valide a fourni les données de paiement. */
  qr_facture_detecte: boolean;
  /** Payload QR-bill décodé (déterministe), source des champs de paiement. */
  qr_facture_data: SwissQrBill | null;
  confiance_globale: number;
  /** Provenance + confiance PAR CHAMP (ADR 0024). Clé = nom du champ. */
  confiance_par_champ: Record<string, ConfianceChamp>;
  anomalies: string[];
}

export interface FactureExtractionInput {
  nom_fichier: string;
  ocr_text?: string | null;
  type_mime?: string;
  /**
   * Payload SPC déjà décodé (E2). `null`/absent = pas de QR (couche image différée) →
   * l'IA porte alors aussi les champs de paiement (fallback, ADR 0020).
   */
  qr_bill?: QrBillDecodeResult | null;
}

export interface FactureExtractionUsage {
  tokens_input: number;
  tokens_output: number;
  cost_usd?: string;
}

export interface FactureExtractionResult {
  proposal: FactureProposal;
  model_used: string;
  prompt_version: string;
  duration_ms: number;
  raw_output: unknown;
  usage?: FactureExtractionUsage;
}

export interface FactureExtractor {
  readonly mode: ExtractionMode;
  extract(input: FactureExtractionInput): Promise<FactureExtractionResult>;
}

// ─── Cœur PUR — fusion QR-first ─────────────────────────────────────────────────

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Applique les données de paiement du QR-bill (déterministes) PAR-DESSUS une proposition.
 * PUR. Si `qr` est absent / non-QR / invalide, la proposition est renvoyée inchangée
 * (qr_facture_detecte=false). Sinon : IBAN, montant (si présent), devise et référence
 * proviennent du QR et écrasent toute valeur IA ; confiance de ces champs = 1.
 *
 * ⚠️ IBAN (ADR 0013) : l'IBAN issu du QR est porté ici sur la proposition EN MÉMOIRE (pour la
 * détection d'anomalies), mais le pipeline E3b le RETIRE avant d'écrire proposition_facture
 * (jamais d'IBAN en clair au repos). L'IBAN-from-QR au Vault à la finalisation est différé au
 * Lot 2 ; le Lot 1 n'alimente que les champs déterministes NON sensibles (montant, référence,
 * devise) + le flag qr_facture_detecte.
 */
export function applyQrBill(
  proposal: FactureProposal,
  qr: QrBillDecodeResult | null | undefined,
): FactureProposal {
  if (!qr || !qr.isSwissQrBill || !qr.valid || qr.data === null) {
    return { ...proposal, qr_facture_detecte: false, qr_facture_data: null };
  }
  const d = qr.data;
  const devise: Devise = d.currency; // CHF | EUR (sous-ensemble de Devise)
  return {
    ...proposal,
    fournisseur: { ...proposal.fournisseur, iban: d.iban },
    // Le QR porte le montant À PAYER ; on ne l'écrase que s'il est présent.
    montant_a_payer: d.amount ?? proposal.montant_a_payer,
    devise,
    reference: d.reference.value ?? proposal.reference,
    qr_facture_detecte: true,
    qr_facture_data: d,
    // Champs issus du QR (déterministes) → source "qr", confiance 1. Le montant n'est marqué
    // QR que s'il est présent dans le QR (facture ouverte = montant absent → on garde l'IA).
    confiance_par_champ: {
      ...proposal.confiance_par_champ,
      iban: { source: "qr", confiance: 1 },
      montant_a_payer:
        d.amount !== null
          ? { source: "qr", confiance: 1 }
          : (proposal.confiance_par_champ.montant_a_payer ?? { source: "ia", confiance: 0 }),
      devise: { source: "qr", confiance: 1 },
      reference: { source: "qr", confiance: 1 },
    },
  };
}

/**
 * Ajoute les anomalies déterministes (E4a, facture.md §5.1) à une proposition FINALE
 * (après applyQrBill, pour voir les valeurs de paiement issues du QR). PUR, dédupliqué.
 */
export function withDetectedAnomalies(proposal: FactureProposal): FactureProposal {
  const detected = detectFactureAnomalies({
    iban: proposal.fournisseur.iban,
    ide: proposal.fournisseur.ide,
    total_ht: proposal.total_ht,
    total_tva: proposal.total_tva,
    total_ttc: proposal.total_ttc,
    montant_a_payer: proposal.montant_a_payer,
    taux_tva_principal: proposal.taux_tva_principal,
    devise: proposal.devise,
    date_emission: proposal.date_emission,
    date_echeance: proposal.date_echeance,
  });
  const merged = [...proposal.anomalies];
  for (const a of detected) if (!merged.includes(a)) merged.push(a);
  return { ...proposal, anomalies: merged };
}

/** Devise sûre depuis une chaîne arbitraire (défaut CHF). */
export function coerceDevise(raw: unknown): Devise {
  return raw === "EUR" || raw === "USD" || raw === "autre" ? raw : "CHF";
}

function coerceNumber(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return null;
}

function blankToNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// ─── Stub déterministe ──────────────────────────────────────────────────────────

export const STUB_FACTURE_PROMPT_VERSION = "stub-facture-v1";

function libelleParDefaut(nom: string): string {
  const sansExt = nom.replace(/\.[a-z0-9]{1,8}$/i, "");
  return sansExt.replace(/[_-]+/g, " ").trim() || nom;
}

/**
 * Extracteur stub : proposition minimale déterministe (pas d'IA). Sert de défaut en prod
 * (EXTRACTION_MODE=stub) → la facture part TOUJOURS en validation humaine complète. Les
 * données de paiement du QR-bill sont néanmoins reportées (valeur déterministe, ADR 0020).
 */
export class StubFactureExtractor implements FactureExtractor {
  readonly mode = "stub" as const;

  async extract(input: FactureExtractionInput): Promise<FactureExtractionResult> {
    const start = Date.now();
    const base: FactureProposal = {
      fournisseur: {
        raison_sociale: libelleParDefaut(input.nom_fichier),
        ide: null,
        numero_tva: null,
        iban: null,
        bic: null,
        adresse: null,
      },
      numero_facture: null,
      date_emission: null,
      date_echeance: null,
      reference: null,
      devise: "CHF",
      total_ht: null,
      total_tva: null,
      total_ttc: null,
      montant_a_payer: null,
      taux_tva_principal: null,
      categorie_comptable: null,
      qr_facture_detecte: false,
      qr_facture_data: null,
      confiance_globale: 0.1,
      confiance_par_champ: {
        fournisseur: { source: "ia", confiance: 0.1 },
        montants: { source: "ia", confiance: 0 },
      },
      anomalies: ["extraction_stub"],
    };
    const proposal = withDetectedAnomalies(applyQrBill(base, input.qr_bill));
    return {
      proposal,
      model_used: "stub",
      prompt_version: STUB_FACTURE_PROMPT_VERSION,
      duration_ms: Date.now() - start,
      raw_output: { mode: "stub", qr: proposal.qr_facture_detecte, proposal },
    };
  }
}

// ─── Normalisation de la sortie live → FactureProposal ──────────────────────────

/**
 * Mappe la sortie brute du modèle (FactureExtractRaw, à plat) vers une FactureProposal sûre,
 * applique le QR-bill (paiement déterministe par-dessus) PUIS les anomalies déterministes
 * (§5.1, E4a). PUR.
 */
export function toFactureProposal(
  raw: unknown,
  input: FactureExtractionInput,
): FactureProposal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const total_ht = coerceNumber(r.total_ht);
  const total_tva = coerceNumber(r.total_tva);
  const total_ttc = coerceNumber(r.total_ttc);

  // Anomalies émises par le modèle (slugs libres) ; les anomalies DÉTERMINISTES (§5.1)
  // sont ajoutées ensuite par withDetectedAnomalies sur la proposition finale.
  const anomalies = Array.isArray(r.anomalies)
    ? r.anomalies.filter((a): a is string => typeof a === "string")
    : [];

  const base: FactureProposal = {
    fournisseur: {
      raison_sociale: blankToNull(r.fournisseur_raison_sociale),
      ide: blankToNull(r.fournisseur_ide),
      numero_tva: blankToNull(r.fournisseur_numero_tva),
      iban: blankToNull(r.fournisseur_iban),
      bic: blankToNull(r.fournisseur_bic),
      adresse: blankToNull(r.fournisseur_adresse),
    },
    numero_facture: blankToNull(r.numero_facture),
    date_emission: blankToNull(r.date_emission),
    date_echeance: blankToNull(r.date_echeance),
    reference: blankToNull(r.reference),
    devise: coerceDevise(r.devise),
    total_ht,
    total_tva,
    total_ttc,
    montant_a_payer: coerceNumber(r.montant_a_payer),
    taux_tva_principal: coerceNumber(r.taux_tva_principal),
    categorie_comptable: blankToNull(r.categorie_comptable),
    qr_facture_detecte: false,
    qr_facture_data: null,
    confiance_globale: clamp01(r.confiance_globale),
    // Champs proposés par l'IA → source "ia". L'IA fournit deux confiances agrégées
    // (fournisseur, montants) ; le QR écrasera ensuite par source "qr" via applyQrBill.
    confiance_par_champ: {
      fournisseur: { source: "ia", confiance: clamp01(r.confiance_fournisseur) },
      montants: { source: "ia", confiance: clamp01(r.confiance_montants) },
    },
    anomalies,
  };

  return withDetectedAnomalies(applyQrBill(base, input.qr_bill));
}

// ─── Résolution stub/live ───────────────────────────────────────────────────────

export function getFactureExtractor(
  mode: ExtractionMode = resolveExtractionMode(),
): FactureExtractor {
  return mode === "live" ? new InfomaniakFactureExtractor() : new StubFactureExtractor();
}

export { FACTURE_PROMPT_VERSION };
