// Pipeline de persistance de la classification documentaire.
//
// Sépare la logique pure (classifier.ts, testable sans DB) de la persistance :
//  1. invoque le Classifier (stub ou Bedrock selon EXTRACTION_MODE)
//  2. trace l'appel dans extraction.invocation (audit + facturation, ADR 0003)
//  3. crée la doc.proposition_classement (pattern proposition → validation, ADR 0007)
// L'entité finale doc.document n'est PAS créée ici : elle naît à la validation
// humaine (Sprint 3.4), jamais automatiquement (doc.md § 11.1).

import { db, invocation, propositionClassement } from "@zarya/db";
import { type ClassificationInput, getClassifier } from "./classifier";

export interface ClassifyDocumentInput {
  cabinet_id: string;
  fichier_physique_id: string;
  nom_fichier: string;
  taille_octets?: number;
  ocr_text?: string | null;
  type_mime?: string;
  invoked_by_user_id?: string;
}

export interface ClassifyDocumentResult {
  invocation_id: string;
  proposition_id: string;
}

export async function classifyDocument(
  input: ClassifyDocumentInput,
): Promise<ClassifyDocumentResult> {
  const classifier = getClassifier();

  const classificationInput: ClassificationInput = {
    nom_fichier: input.nom_fichier,
    ocr_text: input.ocr_text ?? null,
    ...(input.type_mime ? { type_mime: input.type_mime } : {}),
  };

  const result = await classifier.classify(classificationInput);
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
      // Mode stub : aucun coût ni token. Bedrock renseignera ces champs.
      cost_usd: "0",
      tokens_input: 0,
      tokens_output: 0,
    })
    .returning({ id: invocation.id });

  if (!inv) {
    throw new Error("Échec de l'enregistrement de l'invocation");
  }

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
    })
    .returning({ id: propositionClassement.id });

  if (!proposition) {
    throw new Error("Échec de l'enregistrement de la proposition");
  }

  return { invocation_id: inv.id, proposition_id: proposition.id };
}
