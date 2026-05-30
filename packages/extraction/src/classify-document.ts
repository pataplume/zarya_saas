// Pipeline de persistance de la classification documentaire.
//
// Sépare la logique pure (classifier.ts, testable sans DB) de la persistance :
//  1. invoque le Classifier (stub ou Infomaniak selon EXTRACTION_MODE)
//  2. trace l'appel dans extraction.invocation (audit + facturation, ADR 0010)
//  3. crée la doc.proposition_classement (pattern proposition → validation, ADR 0007)
// L'entité finale doc.document n'est PAS créée ici : elle naît à la validation
// humaine (Sprint 3.4), jamais automatiquement (doc.md § 11.1).

import { cabinet, db, invocation, propositionClassement } from "@zarya/db";
import { eq } from "drizzle-orm";
import {
  type ClassificationInput,
  type Classifier,
  ExtractionError,
  type ExtractionMode,
  getClassifier,
  STUB_PROMPT_VERSION,
} from "./classifier";
import { decideAutoClassement, type PolitiqueClassement } from "./decide-auto-classement";
import { finaliserDocument } from "./finalize-document";
import { CLASSIFY_DOC_PROMPT_VERSION } from "./prompts/classification-doc";
import { resolveClientCandidates } from "./resolve-client";

// Statuts d'invocation (extraction.invocation_status, packages/db/src/schema/extraction.ts).
type InvocationStatus =
  | "success"
  | "validation_error"
  | "timeout"
  | "rate_limit"
  | "ocr_failed"
  | "unknown_error";

// Mappe un échec d'extraction vers le statut d'invocation tracé (audit + quota).
// Pur (pas de DB) → testable isolément. Tout ce qui n'est pas un ExtractionError
// connu retombe sur "unknown_error".
export function mapErrorToInvocationStatus(err: unknown): InvocationStatus {
  if (err instanceof ExtractionError) {
    switch (err.code) {
      case "RATE_LIMIT":
        return "rate_limit";
      case "TIMEOUT":
        return "timeout";
      case "VALIDATION_FAILED":
        return "validation_error";
      case "OCR_FAILED":
        return "ocr_failed";
      default:
        return "unknown_error"; // CONFIG, LLM_ERROR
    }
  }
  return "unknown_error";
}

export interface ClassifyDocumentInput {
  cabinet_id: string;
  fichier_physique_id: string;
  nom_fichier: string;
  taille_octets?: number;
  ocr_text?: string | null;
  type_mime?: string;
  invoked_by_user_id?: string;
  // Email de l'expéditeur (flux email entrant) — signal de rattachement client B2.
  // Absent pour les uploads manuels ; le rattachement retombe alors sur IDE + nom.
  expediteur_email?: string | null;
}

export interface ClassifyDocumentResult {
  invocation_id: string;
  proposition_id: string;
  // B4 — `true` si la proposition a été auto-classée (doc.document créé sans validation
  // humaine), selon la politique du cabinet. `false` ⇒ file de validation (défaut MVP).
  auto_classe: boolean;
  // Id du doc.document créé quand auto_classe ; null sinon.
  document_id: string | null;
}

// `classifier` est injectable pour les tests (mode live mocké, sans réseau) ;
// en prod il est résolu par getClassifier() selon EXTRACTION_MODE (défaut stub).
export async function classifyDocument(
  input: ClassifyDocumentInput,
  classifier: Classifier = getClassifier(),
): Promise<ClassifyDocumentResult> {
  const classificationInput: ClassificationInput = {
    nom_fichier: input.nom_fichier,
    ocr_text: input.ocr_text ?? null,
    ...(input.type_mime ? { type_mime: input.type_mime } : {}),
  };

  let result: Awaited<ReturnType<typeof classifier.classify>>;
  try {
    result = await classifier.classify(classificationInput);
  } catch (err) {
    // Trace l'échec (notamment les 429 après retries épuisés) dans
    // extraction.invocation : sans ça, un quota dépassé ne laisserait aucune
    // trace auditable (ADR 0010 § 7). On RE-LÈVE ensuite l'erreur d'origine —
    // le pipeline d'upload la logge (cf. fix échec silencieux, PR #24).
    await traceFailedInvocation(input, classifier.mode, err);
    throw err;
  }
  const { proposal } = result;

  // 1. Traçabilité de l'invocation (une ligne par appel, même en mode stub).
  const [inv] = await db
    .insert(invocation)
    .values({
      cabinet_id: input.cabinet_id,
      context: "classification_doc",
      invoked_by_module: "doc",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "file",
      input_document_id: input.fichier_physique_id,
      input_size_bytes: input.taille_octets ?? null,
      model_used: result.model_used,
      prompt_version: result.prompt_version,
      status: "success",
      nb_items_extracted: 1,
      nb_items_with_anomalies: proposal.anomalies.length > 0 ? 1 : 0,
      raw_output: result.raw_output,
      total_duration_ms: result.duration_ms,
      // Mode stub : pas d'usage → 0. Mode live (Infomaniak) : tokens réels via
      // result.usage. Coût laissé à 0 tant que la tarification IK n'est pas câblée.
      cost_usd: result.usage?.cost_usd ?? "0",
      tokens_input: result.usage?.tokens_input ?? 0,
      tokens_output: result.usage?.tokens_output ?? 0,
    })
    .returning({ id: invocation.id });

  if (!inv) {
    throw new Error("Échec de l'enregistrement de l'invocation");
  }

  // 1bis. Rattachement client multi-signal (B2, ADR 0014). Déterministe, scopé
  // cabinet_id (anti-fuite). Renseigne client_id_propose seulement si la confiance
  // atteint le palier de rattachement (≥ 0.60) ; sinon « à classer manuellement ».
  const clientRes = await resolveClientCandidates({
    cabinet_id: input.cabinet_id,
    texte: `${input.nom_fichier}\n${input.ocr_text ?? ""}`,
    expediteur_email: input.expediteur_email ?? null,
  });

  // 2. Proposition en attente de validation humaine.
  const [proposition] = await db
    .insert(propositionClassement)
    .values({
      cabinet_id: input.cabinet_id,
      fichier_physique_id: input.fichier_physique_id,
      extraction_invocation_id: inv.id,
      statut: "a_valider",
      type_propose: proposal.type,
      categorie_proposee: proposal.categorie,
      periode_proposee: proposal.periode,
      libelle_propose: proposal.libelle,
      confiance_globale: proposal.confiance_globale.toFixed(2),
      confiance_par_champ: proposal.confiance_par_champ,
      anomalies_detectees: proposal.anomalies,
      // Rattachement client B2 : top candidat (si palier ≥ proposer) + top-3 tracés.
      client_id_propose: clientRes.client_id_propose,
      client_candidats:
        clientRes.candidats.length > 0
          ? {
              confiance: clientRes.confiance,
              palier: clientRes.palier,
              candidats: clientRes.candidats,
            }
          : null,
    })
    .returning({ id: propositionClassement.id });

  if (!proposition) {
    throw new Error("Échec de l'enregistrement de la proposition");
  }

  // 3. Décision auto-classement vs file de validation (B4, flow-a §4). La politique
  // vit sur le cabinet ; `strict` (défaut MVP) renvoie toujours en file → comportement
  // inchangé. L'auto exige un client rattaché (doc.document.client_id NOT NULL).
  const [cab] = await db
    .select({ politique: cabinet.politique_classement })
    .from(cabinet)
    .where(eq(cabinet.id, input.cabinet_id))
    .limit(1);
  const politique = (cab?.politique ?? "strict") as PolitiqueClassement;

  const auto = decideAutoClassement({
    politique,
    confiance_globale: proposal.confiance_globale,
    nb_anomalies: proposal.anomalies.length,
    has_client: clientRes.client_id_propose != null,
  });

  if (!auto || clientRes.client_id_propose == null) {
    return {
      invocation_id: inv.id,
      proposition_id: proposition.id,
      auto_classe: false,
      document_id: null,
    };
  }

  // Auto-classement : création directe de l'entité finale (acteur ia, audité). Réutilise
  // le chemin de finalisation partagé avec la validation humaine (B3 + appariement attente).
  const fin = await finaliserDocument({
    cabinet_id: input.cabinet_id,
    client_id: clientRes.client_id_propose,
    fichier_physique_id: input.fichier_physique_id,
    proposition_classement_id: proposition.id,
    type: proposal.type,
    categorie: proposal.categorie,
    periode: proposal.periode,
    libelle: proposal.libelle,
    statut_classement: "auto",
    confiance_classement: proposal.confiance_globale.toFixed(2),
    acteur_type: "ia",
    acteur_id: null,
    cree_par: null,
  });

  // La proposition est terminale (pas de validation humaine) : `valide`, liée au document.
  // valide_par reste null (acteur ia) — l'audit de l'acteur vit dans crm.evenement.
  await db
    .update(propositionClassement)
    .set({ statut: "valide", date_validation: new Date(), document_id: fin.document_id })
    .where(eq(propositionClassement.id, proposition.id));

  return {
    invocation_id: inv.id,
    proposition_id: proposition.id,
    auto_classe: true,
    document_id: fin.document_id,
  };
}

// Écrit une ligne extraction.invocation en échec (best-effort). model_used /
// prompt_version sont remplis au mieux : l'id de modèle résolu n'est pas connu
// quand l'appel échoue, on trace donc le mode et la version de prompt du chemin.
async function traceFailedInvocation(
  input: ClassifyDocumentInput,
  mode: ExtractionMode,
  err: unknown,
): Promise<void> {
  const status = mapErrorToInvocationStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(invocation).values({
      cabinet_id: input.cabinet_id,
      context: "classification_doc",
      invoked_by_module: "doc",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "file",
      input_document_id: input.fichier_physique_id,
      input_size_bytes: input.taille_octets ?? null,
      model_used: mode,
      prompt_version: mode === "live" ? CLASSIFY_DOC_PROMPT_VERSION : STUB_PROMPT_VERSION,
      status,
      nb_items_extracted: 0,
      error_message: message,
    });
  } catch {
    // Échec d'écriture de la trace : on ne masque PAS l'erreur de classification
    // (re-levée par l'appelant). On évite seulement qu'un souci DB secondaire ne
    // remplace la cause réelle remontée à l'upload.
  }
}
