// Détection de l'adéquation de la région du tenant Microsoft (Bloc D3).
// Réf : docs/architecture/microsoft-integration.md §3.3, data-residency.md §3.2 (nLPD —
// liste d'adéquation du Conseil fédéral) + §10 (question ouverte tranchée : AVERTIR, pas
// bloquer ; zone OK = UE/EEE + Suisse + pays adéquats).
//
// ⚠️ Confiance ~70 % sur le signal (microsoft-integration §3.3) : `preferredDataLocation`
// n'existe que pour les tenants Multi-Geo ; `countryLetterCode` est le PAYS DÉCLARÉ de
// l'org (≠ région physique des données). On classe au mieux et, à défaut de signal,
// on est CONSERVATEUR (non adéquat → on avertit). Cœur PUR (aucun réseau / DB).

// Signal brut lu sur GET /organization (champs utiles).
export interface TenantRegionSignal {
  countryLetterCode: string | null; // ISO 3166-1 alpha-2 (pays déclaré de l'org)
  preferredDataLocation: string | null; // code géo Microsoft Multi-Geo (EUR, CHE, NAM…)
}

export type TenantRegionSource = "preferredDataLocation" | "countryLetterCode" | "unknown";

export interface TenantRegionVerdict {
  countryCode: string | null; // countryLetterCode normalisé (MAJ) si présent
  dataLocation: string | null; // preferredDataLocation normalisé (MAJ) si présent
  source: TenantRegionSource; // d'où vient le verdict
  isAdequate: boolean; // true = UE/EEE + Suisse + pays adéquat
}

// Zone OK — ISO 3166-1 alpha-2. UE/EEE + Suisse + pays adéquats (décisions UE/CF).
// Liste maintenue à la main, extensible (data-residency §3.2 / §9 — revue 6 mois).
const ADEQUATE_ISO_COUNTRIES: ReadonlySet<string> = new Set([
  // UE-27
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  // EEE hors UE
  "IS",
  "LI",
  "NO",
  // Suisse (cible n°1) + Royaume-Uni
  "CH",
  "GB",
  // Autres pays sous décision d'adéquation UE (extensible)
  "AD",
  "AR",
  "CA",
  "FO",
  "GG",
  "IL",
  "IM",
  "JP",
  "JE",
  "NZ",
  "KR",
  "UY",
]);

// Codes géo Microsoft Multi-Geo (preferredDataLocation) considérés adéquats : géos
// européens + Suisse + UK. Réf : codes "Preferred Data Location" Microsoft 365.
const ADEQUATE_MS_GEOS: ReadonlySet<string> = new Set([
  "EUR",
  "FRA",
  "DEU",
  "CHE",
  "GBR",
  "NOR",
  "SWE",
  "POL",
]);

/**
 * Classe la région d'un tenant à partir du signal Graph. PUR et déterministe.
 * Priorité à `preferredDataLocation` (géo réel des données Multi-Geo), sinon
 * `countryLetterCode` (pays déclaré), sinon `unknown` → non adéquat (conservateur).
 */
export function classifyTenantRegion(signal: TenantRegionSignal): TenantRegionVerdict {
  const dataLocation = signal.preferredDataLocation
    ? signal.preferredDataLocation.toUpperCase()
    : null;
  const countryCode = signal.countryLetterCode ? signal.countryLetterCode.toUpperCase() : null;

  if (dataLocation) {
    return {
      countryCode,
      dataLocation,
      source: "preferredDataLocation",
      isAdequate: ADEQUATE_MS_GEOS.has(dataLocation),
    };
  }
  if (countryCode) {
    return {
      countryCode,
      dataLocation: null,
      source: "countryLetterCode",
      isAdequate: ADEQUATE_ISO_COUNTRIES.has(countryCode),
    };
  }
  // Aucun signal exploitable → on ne peut pas confirmer l'adéquation → on avertit.
  return { countryCode: null, dataLocation: null, source: "unknown", isAdequate: false };
}
