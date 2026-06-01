// Orchestration de la détection de région tenant (Bloc D3) : lit le signal Graph,
// le classe (cœur pur), persiste le verdict. Best-effort par convention d'appel : le
// callback OAuth ne doit PAS échouer si la détection échoue (région inconnue ≠ blocage).
// Source et persistance injectables → testable sans réseau ni DB.

import { MicrosoftGraphClient } from "./client";
import { classifyTenantRegion, type TenantRegionSignal, type TenantRegionVerdict } from "./region";
import { saveTenantRegionVerdict } from "./token-store";

export interface TenantRegionResult extends TenantRegionVerdict {
  checkedAt: string; // ISO
}

interface RegionSource {
  getTenantRegionSignal(): Promise<TenantRegionSignal>;
}

export interface DetectTenantRegionOptions {
  /** Source du signal (défaut : un MicrosoftGraphClient scopé cabinet_id). */
  source?: RegionSource;
  /** Persistance du verdict (défaut : saveTenantRegionVerdict → cabinet_integration). */
  persist?: (cabinetId: string, verdict: TenantRegionResult) => Promise<void>;
  /** Horloge (injectable pour tests). */
  now?: () => number;
}

/**
 * Détecte la région du tenant d'un cabinet, classe son adéquation (UE/EEE + Suisse +
 * adéquats) et persiste le verdict. Retourne le verdict pour décision UI en aval
 * (avertissement si `isAdequate === false`).
 */
export async function detectAndPersistTenantRegion(
  cabinet_id: string,
  opts: DetectTenantRegionOptions = {},
): Promise<TenantRegionResult> {
  const source = opts.source ?? new MicrosoftGraphClient(cabinet_id);
  const persist = opts.persist ?? saveTenantRegionVerdict;
  const now = opts.now ?? Date.now;

  const signal = await source.getTenantRegionSignal();
  const verdict = classifyTenantRegion(signal);
  const result: TenantRegionResult = { ...verdict, checkedAt: new Date(now()).toISOString() };
  await persist(cabinet_id, result);
  return result;
}
