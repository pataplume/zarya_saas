// Appariement d'un document validé à une attente `crm.document_attendu` (Bloc B3).
//
// À la validation humaine, un `doc.document` naît avec une période détectée
// (`2026-04`, `2026-Q1`, `2025`, ou aucune). B3 doit retrouver, parmi les attentes
// du client, celle que ce document couvre — pour la passer à `recu` (doc.md §6.3).
//
// La difficulté : `crm.document_attendu.type_document` est du TEXTE LIBRE (« Relevé
// bancaire UBS »), pas le slug `doc.document.type`. On apparie donc par signaux
// robustes — fréquence (dérivée du format de période) + catégorie — puis on départage
// les ex æquo par recouvrement de tokens sur le libellé d'attente. Aucune devinette :
// si l'appariement reste ambigu (plusieurs ex æquo), on ne lie rien.
//
// La logique est PURE (testable sans DB) : la récupération scopée `cabinet_id` +
// `client_id` (anti-fuite) vit dans la server action de validation.

// Fréquences appariables depuis une période. `semestrielle`/`ponctuelle` existent dans
// l'enum DB mais n'ont pas de format de période canonique (doc.md §6.1) → non dérivées.
export type FrequenceAttendu = "mensuelle" | "trimestrielle" | "annuelle";

const RE_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/; // 2026-04
const RE_TRIMESTRE = /^\d{4}-Q[1-4]$/i; //    2026-Q1
const RE_ANNEE = /^\d{4}$/; //                2025

// Déduit la fréquence d'attente couverte par une période détectée.
// `null` = pas de période (ponctuel) ou format inconnu → aucun appariement possible.
export function periodeFrequence(periode: string | null | undefined): FrequenceAttendu | null {
  if (!periode) return null;
  const p = periode.trim();
  if (RE_MOIS.test(p)) return "mensuelle";
  if (RE_TRIMESTRE.test(p)) return "trimestrielle";
  if (RE_ANNEE.test(p)) return "annuelle";
  return null;
}

// Lignes minimales nécessaires à l'appariement (projection explicite, pas de SELECT *).
export interface AttenduRow {
  id: string;
  type_document: string;
  categorie: string | null;
  frequence: string; // crm.frequence_service (mensuelle|trimestrielle|…)
}

export interface DocumentSignals {
  type: string;
  categorie: string;
  libelle: string;
  periode: string | null;
}

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

// Cœur PUR : renvoie l'id de l'attente couverte par le document, ou `null`.
// Appariement : fréquence (dérivée de la période) === frequence de l'attente, ET
// (catégorie de l'attente nulle OU égale à celle du document). En cas d'ex æquo,
// départage par recouvrement de tokens `type_document` ↔ `type + libellé` du doc ;
// si l'ambiguïté persiste (meilleur score non unique), on ne lie rien.
export function matchDocumentAttendu(doc: DocumentSignals, attendus: AttenduRow[]): string | null {
  const freq = periodeFrequence(doc.periode);
  if (!freq) return null;

  const candidats = attendus.filter(
    (a) => a.frequence === freq && (a.categorie == null || a.categorie === doc.categorie),
  );
  if (candidats.length === 0) return null;
  if (candidats.length === 1) return candidats[0]?.id ?? null;

  // Ex æquo sur (fréquence, catégorie) → départage par le libellé d'attente.
  const docTokens = tokenSet(`${doc.type} ${doc.libelle}`);
  let best = -1;
  let bestId: string | null = null;
  let bestCount = 0;
  for (const a of candidats) {
    let overlap = 0;
    for (const t of Array.from(tokenSet(a.type_document))) if (docTokens.has(t)) overlap += 1;
    if (overlap > best) {
      best = overlap;
      bestId = a.id;
      bestCount = 1;
    } else if (overlap === best) {
      bestCount += 1;
    }
  }
  // Aucun recouvrement (best 0) ou meilleur score partagé → ambigu, on ne devine pas.
  return best > 0 && bestCount === 1 ? bestId : null;
}
