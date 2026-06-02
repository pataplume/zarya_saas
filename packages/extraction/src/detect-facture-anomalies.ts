// Détection d'anomalies de facture — couche DÉTERMINISTE (Bloc E4a, facture.md §5.1).
//
// Règles métier PURES (aucun appel réseau/DB) appliquées sur une proposition extraite :
// validité IBAN (mod-97), IDE (mod-11), cohérence TVA (HT+TVA=TTC ±0.01), taux TVA suisse
// valide, devise reconnue, bornes de montant, plausibilité des dates. Les anomalies sont
// des slugs courts ajoutés à `FactureProposal.anomalies` (persistés dans
// `facture.proposition_facture.anomalies_detectees`) ; elles N'ONT PAS d'effet bloquant —
// elles s'affichent au validateur (facture.md §5 « le collaborateur décide »).
//
// Hors périmètre E4a (→ E4b, après E5 quand le référentiel fournisseur/historique existe) :
// cohérence historique (§5.2), fraude IBAN/changement de RIB (§5.3), doublons (§5.4).
//
// Réutilise les validateurs de checksum exposés par le décodage QR-bill (E2).

import { isValidIban } from "./qr-bill";

/** Taux de TVA suisses valides en 2026 (facture.md §5.1). */
export const TAUX_TVA_CH_VALIDES = [0, 2.6, 3.8, 8.1] as const;

/** Seuil d'alerte « montant élevé » (facture.md §5.1). */
export const SEUIL_MONTANT_ELEVE = 100_000;
/** Plafond dur de montant plausible (facture.md §5.1). */
export const PLAFOND_MONTANT = 10_000_000;
/** Année minimale plausible pour une date de facture. */
export const ANNEE_MIN_PLAUSIBLE = 2015;

/**
 * Valide un IDE/UID suisse (CHE-###.###.### : 9 chiffres, dernier = clé mod-11).
 * Pondérations SIX/OFS sur les 8 premiers chiffres : 5,4,3,2,7,6,5,4.
 * check = 11 − (Σ pondéré mod 11) ; 11→0 ; 10→IDE invalide.
 */
export function isValidIde(raw: string): boolean {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 9) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i < 8 ≤ digits.length, weights[i] défini.
    sum += Number(digits[i]!) * weights[i]!;
  }
  const r = sum % 11;
  const check = 11 - r;
  if (check === 10) return false; // IDE invalide par construction
  const expected = check === 11 ? 0 : check;
  return expected === Number(digits[8]);
}

/** Champs nécessaires à la détection (sous-ensemble de FactureProposal, découplé). */
export interface FactureAnomalyInput {
  iban: string | null;
  ide: string | null;
  total_ht: number | null;
  total_tva: number | null;
  total_ttc: number | null;
  montant_a_payer: number | null;
  taux_tva_principal: number | null;
  devise: string;
  date_emission: string | null;
  date_echeance: string | null;
}

function anneeDe(date: string | null): number | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?.[1] ? Number(m[1]) : null;
}

/**
 * Détecte les anomalies déterministes d'une facture (facture.md §5.1). PUR.
 * Retourne des slugs courts, dédupliqués, ordre stable. Une valeur absente (null) n'est
 * jamais une anomalie en soi (l'absence est gérée par la confiance, pas ici).
 */
export function detectFactureAnomalies(input: FactureAnomalyInput): string[] {
  const anomalies: string[] = [];
  const add = (slug: string) => {
    if (!anomalies.includes(slug)) anomalies.push(slug);
  };

  // IBAN (mod-97) — uniquement si présent (le QR fournit un IBAN déjà validé en amont).
  if (input.iban !== null && !isValidIban(input.iban)) add("iban_invalide");

  // IDE (mod-11).
  if (input.ide !== null && !isValidIde(input.ide)) add("ide_invalide");

  // Cohérence TVA : HT + TVA = TTC ± 0.01.
  if (input.total_ht !== null && input.total_tva !== null && input.total_ttc !== null) {
    // Comparaison en centimes arrondis : tolère ±0.01 sans faux positif flottant.
    const ecartCentimes = Math.round(
      Math.abs(input.total_ttc - (input.total_ht + input.total_tva)) * 100,
    );
    if (ecartCentimes > 1) add("tva_incoherente");
  }

  // Taux de TVA suisse valide.
  if (
    input.taux_tva_principal !== null &&
    !TAUX_TVA_CH_VALIDES.some((t) => Math.abs(t - (input.taux_tva_principal as number)) < 0.001)
  ) {
    add("taux_tva_invalide");
  }

  // Devise reconnue (CHF/EUR/USD ; "autre" ou inconnue → anomalie).
  if (!["CHF", "EUR", "USD"].includes(input.devise)) add("devise_inconnue");

  // Bornes de montant (sur le montant à payer, sinon le TTC).
  const montant = input.montant_a_payer ?? input.total_ttc;
  if (montant !== null) {
    if (montant <= 0 || montant >= PLAFOND_MONTANT) add("montant_invalide");
    else if (montant > SEUIL_MONTANT_ELEVE) add("montant_eleve");
  }

  // Plausibilité des dates.
  const anneeEmission = anneeDe(input.date_emission);
  if (anneeEmission !== null && anneeEmission < ANNEE_MIN_PLAUSIBLE)
    add("date_emission_implausible");
  if (
    input.date_emission !== null &&
    input.date_echeance !== null &&
    input.date_echeance < input.date_emission
  ) {
    add("echeance_avant_emission");
  }

  return anomalies;
}
