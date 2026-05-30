// Décision « auto-classement vs file de validation » selon la politique du cabinet
// (Bloc B4). flow-a §4 + ADR 0014.
//
// Logique PURE (testable sans DB). La politique vit dans crm.cabinet.politique_classement ;
// la récupération + les effets de bord (création doc.document) vivent côté pipeline.
//
// `strict` (défaut MVP) ne déclenche JAMAIS l'auto — les seuils 0.95/0.80 restent
// « inactifs en MVP » tant qu'aucun cabinet n'opte pour hybride/aggressive (ADR 0014).

export type PolitiqueClassement = "strict" | "hybride" | "aggressive";

// Seuils sur `confiance_globale` (flow-a §4). Distincts des seuils de rattachement
// *client* (0.90/0.60, doc.md §5.2, produits par B2) — deux axes séparés (ADR 0014).
export const SEUIL_AUTO_HYBRIDE = 0.95;
export const SEUIL_AUTO_AGGRESSIVE = 0.8;

export interface AutoClassementSignals {
  politique: PolitiqueClassement;
  confiance_globale: number; // 0..1
  nb_anomalies: number;
  // Un client a été rattaché (palier ≥ proposer). doc.document.client_id est NOT NULL :
  // sans client résolu, l'auto-création est impossible → fallback file quelle que soit
  // la confiance.
  has_client: boolean;
}

// `true` ⇒ la proposition peut être auto-classée (création doc.document sans validation
// humaine). `false` ⇒ file de validation. L'auto exige TOUJOURS un client rattaché.
export function decideAutoClassement(s: AutoClassementSignals): boolean {
  if (!s.has_client) return false;
  switch (s.politique) {
    case "hybride":
      return s.confiance_globale > SEUIL_AUTO_HYBRIDE && s.nb_anomalies === 0;
    case "aggressive":
      return s.confiance_globale > SEUIL_AUTO_AGGRESSIVE;
    default:
      return false; // strict
  }
}
