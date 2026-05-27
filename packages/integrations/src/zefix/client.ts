import type { ZefixCompanyDetail, ZefixCompanySummary, ZefixResultat } from "./types";

// Base URL configurable via ZEFIX_BASE_URL (cf. ADR 0009)
const ZEFIX_BASE_URL =
  (typeof process !== "undefined" ? process.env.ZEFIX_BASE_URL : undefined) ??
  "https://www.zefix.admin.ch/ZefixPublicREST/api/v1";
const TIMEOUT_MS = 10_000;

// HTTP Basic auth (ADR 0009 : credentials partagés plateforme, jamais exposés côté client)
function buildAuthHeader(): string | undefined {
  const username = typeof process !== "undefined" ? process.env.ZEFIX_USERNAME : undefined;
  const password = typeof process !== "undefined" ? process.env.ZEFIX_PASSWORD : undefined;
  if (!username || !password) return undefined;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

// Erreur typée pour l'intégration Zefix
export class ZefixError extends Error {
  constructor(
    public readonly code: "timeout" | "rate_limit" | "not_found" | "api_error" | "parse_error",
    message: string,
    // Nommé `originalCause` pour éviter le conflit avec Error.cause (ES2022+)
    public readonly originalCause?: unknown,
  ) {
    super(message);
    this.name = "ZefixError";
  }
}

// Normalise le statut Zefix vers le vocabulaire ZARYA
function normaliserStatut(statut: string): ZefixResultat["statut"] {
  const s = statut.toUpperCase();
  if (s === "ACTIVE") return "actif";
  if (s === "IN_LIQUIDATION") return "en_liquidation";
  if (s === "DELETED") return "radie";
  return "inconnu";
}

// Normalise le nom de la forme juridique (peut être objet ou string)
function normaliserFormeJuridique(legalForm: ZefixCompanySummary["legalForm"]): string | undefined {
  if (!legalForm) return undefined;
  if (typeof legalForm.name === "string") return legalForm.name;
  return legalForm.name.fr ?? legalForm.name.de ?? legalForm.name.en ?? legalForm.name.it;
}

// Convertit un résultat brut Zefix vers ZefixResultat normalisé
// Note : exactOptionalPropertyTypes → on n'assigne que les champs définis
function normaliser(raw: ZefixCompanySummary | ZefixCompanyDetail): ZefixResultat {
  const result: ZefixResultat = {
    ehraid: String(raw.ehraid),
    ide: raw.uid,
    raison_sociale: raw.name,
    statut: normaliserStatut(raw.status),
  };

  const formeJuridique = normaliserFormeJuridique(raw.legalForm);
  if (formeJuridique !== undefined) result.forme_juridique = formeJuridique;

  if (raw.address?.street) {
    result.adresse_rue = [raw.address.street, raw.address.houseNumber].filter(Boolean).join(" ");
  }
  if (raw.address?.swissZipCode) result.adresse_npa = raw.address.swissZipCode;
  if (raw.address?.town) result.adresse_ville = raw.address.town;
  const canton = raw.cantons?.[0];
  if (canton) result.adresse_canton = canton;
  if (raw.registrationDate) result.date_inscription_rc = raw.registrationDate;

  if ("capitalNominal" in raw && raw.capitalNominal != null) {
    result.capital_social = String(raw.capitalNominal);
  }
  if ("capitalCurrency" in raw && raw.capitalCurrency) {
    result.capital_devise = raw.capitalCurrency;
  }
  if ("purpose" in raw && raw.purpose) {
    result.but_statutaire = raw.purpose;
  }

  return result;
}

// Fetch avec timeout et auth Basic (ADR 0009 — credentials serveur uniquement)
async function fetchAvecTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  const authHeader = buildAuthHeader();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ZefixError("timeout", "L'API Zefix n'a pas répondu dans les 10 secondes");
    }
    throw new ZefixError("api_error", "Erreur réseau lors de l'appel Zefix", err);
  } finally {
    clearTimeout(id);
  }
}

export class ZefixClient {
  /**
   * Recherche par nom ou IDE (débouncing côté appelant).
   * Retourne jusqu'à 20 résultats normalisés.
   */
  async rechercherParNom(
    nom: string,
    options?: { canton?: string; maxEntries?: number },
  ): Promise<ZefixResultat[]> {
    const params = new URLSearchParams({
      name: nom,
      lang: "fr",
      maxEntries: String(options?.maxEntries ?? 20),
      offset: "0",
      ...(options?.canton ? { canton: options.canton } : {}),
    });

    const url = `${ZEFIX_BASE_URL}/company/search?${params.toString()}`;

    const response = await fetchAvecTimeout(url);

    if (response.status === 429) {
      throw new ZefixError("rate_limit", "Quota Zefix atteint, réessayez dans quelques secondes");
    }
    if (!response.ok) {
      throw new ZefixError("api_error", `Zefix a retourné HTTP ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new ZefixError("parse_error", "Réponse Zefix non parseable", err);
    }

    if (!Array.isArray(data)) return [];

    return (data as ZefixCompanySummary[]).map(normaliser);
  }

  /**
   * Récupère le détail complet d'une entreprise par son IDE (CHE-XXX.XXX.XXX).
   */
  async rechercherParIde(ide: string): Promise<ZefixResultat | null> {
    // L'API attend le format sans tirets/points pour l'URL : CHE-123.456.789 → CHE-123.456.789
    const url = `${ZEFIX_BASE_URL}/company/uid/${encodeURIComponent(ide)}`;

    const response = await fetchAvecTimeout(url);

    if (response.status === 404) return null;
    if (response.status === 429) {
      throw new ZefixError("rate_limit", "Quota Zefix atteint");
    }
    if (!response.ok) {
      throw new ZefixError("api_error", `Zefix a retourné HTTP ${response.status}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new ZefixError("parse_error", "Réponse Zefix non parseable", err);
    }

    // Zefix peut retourner un tableau ou un objet unique
    if (Array.isArray(data)) {
      const premier = data[0] as ZefixCompanyDetail | undefined;
      return premier ? normaliser(premier) : null;
    }

    return normaliser(data as ZefixCompanyDetail);
  }
}

// Instance singleton exportée (pas de cabinet_id requis pour Zefix — API publique)
export const zefixClient = new ZefixClient();
