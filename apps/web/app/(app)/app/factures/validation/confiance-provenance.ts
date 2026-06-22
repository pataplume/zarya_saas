// Provenance + confiance par champ (ADR 0024) — helpers PURS et SERVER-SAFE (PAS de "use client").
//
// Ces utilitaires étaient initialement dans `factures-client.tsx` ("use client"). Or des Server
// Components les appellent (fiche document `documents/[id]/page.tsx` § C2.3 ; file de validation
// `factures/validation/page.tsx`). Appeler une fonction exportée par un module client depuis le
// serveur jette à l'exécution (« Attempted to call … from the server but … is on the client »).
// On les isole donc ici pour qu'ils soient appelables des deux côtés.

/** Provenance + confiance d'un champ proposé (ADR 0024). Côté UI (miroir de l'extraction). */
export interface ConfianceChampUi {
  source: "qr" | "ia" | "humain";
  confiance: number;
}

/** Map champ → provenance, normalisée et sûre (jamais la forme brute jsonb). */
export type ConfianceParChampUi = Record<string, ConfianceChampUi>;

/**
 * Lecteur DÉFENSIF de `confiance_par_champ` (jsonb). Gère les deux formes :
 *  - nouvelle (ADR 0024) : `{ source, confiance }` par champ ;
 *  - ancienne (legacy) : un simple `number` par champ → interprété `{ source: "ia", confiance }`.
 * Toute entrée illisible est ignorée. Ne lève jamais.
 */
export function normaliserConfianceParChamp(raw: unknown): ConfianceParChampUi {
  const out: ConfianceParChampUi = {};
  if (raw === null || typeof raw !== "object") return out;
  for (const [champ, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[champ] = { source: "ia", confiance: v };
      continue;
    }
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const source =
        o.source === "qr" || o.source === "ia" || o.source === "humain" ? o.source : "ia";
      const confiance =
        typeof o.confiance === "number" && Number.isFinite(o.confiance) ? o.confiance : 0;
      out[champ] = { source, confiance };
    }
  }
  return out;
}
