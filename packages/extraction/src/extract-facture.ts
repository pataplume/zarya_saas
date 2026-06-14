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
  /**
   * 2e passe IA ciblée (ADR 0024 §6) : clés de champs que la passe 1 n'a pas pu remplir / a
   * mal remplis. Présent et non vide → l'extracteur live AJOUTE une consigne de focus au prompt
   * (même schéma de sortie). Le stub l'ignore.
   */
  champs_a_completer?: string[];
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

/** Normalise un IBAN pour comparaison (sans espaces, majuscules) — recoupement QR↔IA. */
function normaliserIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

/**
 * Applique les données de paiement du QR-bill (déterministes) PAR-DESSUS une proposition.
 * PUR. Si `qr` est absent / non-QR / invalide, la proposition est renvoyée inchangée
 * (qr_facture_detecte=false). Sinon : IBAN, montant (si présent), devise et référence
 * proviennent du QR et écrasent toute valeur IA ; confiance de ces champs = 1.
 *
 * ⚠️ IBAN (ADR 0013) : l'IBAN issu du QR est porté ici sur la proposition EN MÉMOIRE (pour la
 * détection d'anomalies), mais le pipeline E3b le RETIRE avant d'écrire proposition_facture
 * (jamais d'IBAN en clair au repos). L'IBAN déterministe du QR est en outre chiffré au Vault dès
 * la proposition par le pipeline (C6.1, ADR 0024 §5 : iban_paiement_vault_id + iban_paiement_masque).
 * applyQrBill, lui, reste PUR : il n'alimente que la proposition en mémoire (montant, référence,
 * devise, IBAN pour anomalies) + le flag qr_facture_detecte.
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

  // Recoupement QR ↔ IA (ADR 0024 §4) : si l'IA avait proposé un IBAN DIFFÉRENT de celui du
  // QR-bill (déterministe), c'est un signal de fraude (RIB substitué) → anomalie. Le QR fait foi.
  const anomalies = [...proposal.anomalies];
  const ibanIa = proposal.fournisseur.iban;
  if (ibanIa && normaliserIban(ibanIa) !== normaliserIban(d.iban)) {
    if (!anomalies.includes("incoherence_qr_ia_iban")) anomalies.push("incoherence_qr_ia_iban");
  }

  return {
    ...proposal,
    anomalies,
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

// ─── 2e passe IA ciblée (Lot 3, ADR 0024 §6) — cœur PUR ─────────────────────────

/** Seuil de confiance en-dessous duquel un champ IA est jugé « douteux » (ADR 0024 §6). */
export const SEUIL_CONFIANCE_2E_PASSE = 0.6;

/**
 * Champs susceptibles d'une 2e passe IA (ADR 0024 §6). `montantKey`/`confKey` désignent la
 * clé de provenance agrégée dans `confiance_par_champ` (l'IA n'émet que `fournisseur` et
 * `montants` ; le QR émet des clés fines via applyQrBill). `valeur` lit la valeur courante
 * pour le test de nullité.
 */
const CHAMPS_2E_PASSE: ReadonlyArray<{
  cle: string;
  /** Clé de provenance dans confiance_par_champ (agrégée côté IA). */
  confKey: string;
  valeur: (p: FactureProposal) => unknown;
}> = [
  { cle: "numero_facture", confKey: "fournisseur", valeur: (p) => p.numero_facture },
  { cle: "date_emission", confKey: "montants", valeur: (p) => p.date_emission },
  { cle: "date_echeance", confKey: "montants", valeur: (p) => p.date_echeance },
  { cle: "total_ht", confKey: "montants", valeur: (p) => p.total_ht },
  { cle: "total_tva", confKey: "montants", valeur: (p) => p.total_tva },
  { cle: "total_ttc", confKey: "montants", valeur: (p) => p.total_ttc },
  { cle: "montant_a_payer", confKey: "montants", valeur: (p) => p.montant_a_payer },
  { cle: "taux_tva_principal", confKey: "montants", valeur: (p) => p.taux_tva_principal },
  { cle: "fournisseur", confKey: "fournisseur", valeur: (p) => p.fournisseur.raison_sociale },
  { cle: "categorie_comptable", confKey: "fournisseur", valeur: (p) => p.categorie_comptable },
];

/**
 * Provenance d'un champ : on privilégie la clé FINE (nom du champ, posée par applyQrBill pour
 * les champs de paiement déterministes) puis la clé AGRÉGÉE (`fournisseur`/`montants`, posée par
 * l'IA via toFactureProposal). Cela garantit qu'un champ marqué "qr" au niveau fin est bien vu.
 */
function provenanceDe(p: FactureProposal, cle: string): ConfianceChamp | undefined {
  const fine = p.confiance_par_champ[cle];
  if (fine) return fine;
  const meta = CHAMPS_2E_PASSE.find((c) => c.cle === cle);
  return meta ? p.confiance_par_champ[meta.confKey] : undefined;
}

/**
 * Renvoie les clés de champs à retravailler par une 2e passe IA (ADR 0024 §6) : valeur null
 * OU (provenance "ia" ET confiance < SEUIL). PUR. **Exclut** tout champ porté par le QR
 * (source "qr", déterministe — jamais re-questionné). `[]` si rien à compléter.
 */
export function champsACompleter(proposal: FactureProposal): string[] {
  const champs: string[] = [];
  for (const { cle, valeur } of CHAMPS_2E_PASSE) {
    const prov = provenanceDe(proposal, cle);
    // Champ déterministe (QR) : jamais re-questionné.
    if (prov?.source === "qr") continue;
    const estNull = valeur(proposal) === null;
    const iaDouteux = prov?.source === "ia" && prov.confiance < SEUIL_CONFIANCE_2E_PASSE;
    if (estNull || iaDouteux) champs.push(cle);
  }
  return champs;
}

/** Applique une valeur scalaire de champ « complétable » sur une copie de proposition. */
function setChamp(p: FactureProposal, cle: string, source: FactureProposal): FactureProposal {
  switch (cle) {
    case "numero_facture":
      return { ...p, numero_facture: source.numero_facture };
    case "date_emission":
      return { ...p, date_emission: source.date_emission };
    case "date_echeance":
      return { ...p, date_echeance: source.date_echeance };
    case "total_ht":
      return { ...p, total_ht: source.total_ht };
    case "total_tva":
      return { ...p, total_tva: source.total_tva };
    case "total_ttc":
      return { ...p, total_ttc: source.total_ttc };
    case "montant_a_payer":
      return { ...p, montant_a_payer: source.montant_a_payer };
    case "taux_tva_principal":
      return { ...p, taux_tva_principal: source.taux_tva_principal };
    case "categorie_comptable":
      return { ...p, categorie_comptable: source.categorie_comptable };
    case "fournisseur":
      // On comble l'identité fournisseur (hors IBAN, déterminé par le QR le cas échéant).
      return {
        ...p,
        fournisseur: {
          ...p.fournisseur,
          raison_sociale: source.fournisseur.raison_sociale,
          ide: source.fournisseur.ide,
          numero_tva: source.fournisseur.numero_tva,
          bic: source.fournisseur.bic,
          adresse: source.fournisseur.adresse,
        },
      };
    default:
      return p;
  }
}

/** Valeur « comble-able » d'un champ (pour décider si pass2 apporte une valeur non-null). */
function valeurChamp(p: FactureProposal, cle: string): unknown {
  return CHAMPS_2E_PASSE.find((c) => c.cle === cle)?.valeur(p) ?? null;
}

/**
 * Fusionne la 2e passe IA dans la proposition de la passe 1 (ADR 0024 §6). PUR.
 *
 * Pour chaque clé de `champs` (dédupliquée) : on adopte la valeur de `pass2` SSI elle est
 * non-null ET (pass1 était null OU la confiance de pass2 ≥ celle de pass1). La provenance du
 * champ devient `{source:"ia", confiance}` de pass2.
 *
 * Garde-fous : on ne touche JAMAIS aux champs déterministes du QR de pass1 (provenance "qr" :
 * iban/montant/devise/référence), ni à `qr_facture_detecte`/`qr_facture_data`. Les anomalies
 * ne sont PAS recalculées ici (le pipeline rappelle withDetectedAnomalies).
 */
export function fusionnerDeuxiemePasse(
  pass1: FactureProposal,
  pass2: FactureProposal,
  champs: string[],
): FactureProposal {
  let merged = pass1;
  const confiance_par_champ: Record<string, ConfianceChamp> = { ...pass1.confiance_par_champ };
  const cles = Array.from(new Set(champs));

  for (const cle of cles) {
    const prov1 = provenanceDe(pass1, cle);
    // Champ déterministe (QR) : intouchable.
    if (prov1?.source === "qr") continue;

    const v2 = valeurChamp(pass2, cle);
    if (v2 === null || v2 === undefined) continue;

    const prov2 = provenanceDe(pass2, cle);
    const conf2 = prov2?.confiance ?? 0;
    const conf1 = prov1?.confiance ?? 0;
    const pass1EtaitNull = valeurChamp(pass1, cle) === null;

    if (pass1EtaitNull || conf2 >= conf1) {
      merged = setChamp(merged, cle, pass2);
      const meta = CHAMPS_2E_PASSE.find((c) => c.cle === cle);
      const key = meta ? meta.confKey : cle;
      // On ne dégrade jamais une provenance "qr" déjà posée (défense en profondeur).
      if (confiance_par_champ[key]?.source !== "qr") {
        confiance_par_champ[key] = { source: "ia", confiance: clamp01(conf2) };
      }
    }
  }

  return { ...merged, confiance_par_champ };
}

// ─── Résolution stub/live ───────────────────────────────────────────────────────

export function getFactureExtractor(
  mode: ExtractionMode = resolveExtractionMode(),
): FactureExtractor {
  return mode === "live" ? new InfomaniakFactureExtractor() : new StubFactureExtractor();
}

export { FACTURE_PROMPT_VERSION };
