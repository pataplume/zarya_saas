// Pipeline de persistance de l'extraction facture (Bloc E3b).
//
// Câblé en aval de la finalisation d'un doc.document de type `facture_*` (hook dans
// finaliserDocument). Étapes :
//  1. décode le QR-bill (seam E2 ; couche image différée → null → fallback IA) ;
//  2. invoque le FactureExtractor (stub par défaut, Infomaniak live derrière EXTRACTION_MODE) ;
//  3. trace l'appel dans extraction.invocation (context `facture` ; audit + facturation ADR 0010) ;
//  4. crée facture.proposition_facture (pattern proposition → validation, ADR 0007).
//
// SÉCURITÉ IBAN (ADR 0013) : l'IBAN proposé n'est JAMAIS persisté en clair au stade
// proposition. Il est retiré de fournisseur_propose_data ET de qr_facture_data avant insert ;
// l'IBAN authoritatif rejoindra Supabase Vault (anti-clair) à la création de l'entité finale
// facture.fournisseur/facture.facture (E5). Les autres données QR (montant, devise, référence,
// créancier) ne sont pas sensibles et sont conservées.

import { db, invocation, propositionFacture } from "@zarya/db";
import { type ExtractionMode, resolveExtractionModeForCabinet } from "./classifier";
import { mapErrorToInvocationStatus } from "./classify-document";
import { mimePeutPorterQr, natureFichierDepuisMime } from "./detect-nature-fichier";
import {
  FACTURE_PROMPT_VERSION,
  type FactureExtractor,
  getFactureExtractor,
  STUB_FACTURE_PROMPT_VERSION,
} from "./extract-facture";
import { decodeQrFromDocument, type QrBillDecodeResult, type QrPayloadExtractor } from "./qr-bill";

export interface ExtraireFactureInput {
  cabinet_id: string;
  client_id: string;
  /** doc.document finalisé (type facture_*) — porte la proposition_facture (FK UNIQUE). */
  document_id: string;
  fichier_physique_id: string;
  /** Nom logique du document (libellé / nom standardisé). */
  nom_fichier: string;
  ocr_text?: string | null;
  type_mime?: string;
  invoked_by_user_id?: string | null;
  /** Storage du blob (pour le seam QR image, différé). */
  storage_path?: string | null;
}

export interface ExtraireFactureResult {
  invocation_id: string;
  proposition_id: string;
  qr_detecte: boolean;
}

// numeric(p,s) Drizzle attend une string ; null reste null.
function num(v: number | null, scale = 2): string | null {
  return v === null ? null : v.toFixed(scale);
}

/**
 * Extrait une facture depuis un doc.document finalisé et crée la proposition_facture.
 * `extractor` et `qrExtract` (seam image) sont injectables pour les tests.
 *
 * En cas d'échec de l'extraction (LLM), trace une invocation en échec puis RE-LÈVE
 * (l'appelant — hook best-effort — logge et continue sans casser la finalisation Doc).
 */
export async function extraireFactureDepuisDocument(
  input: ExtraireFactureInput,
  injectedExtractor?: FactureExtractor,
  qrExtract?: QrPayloadExtractor,
): Promise<ExtraireFactureResult> {
  // Cabinet-aware (ADR 0023) : live ssi env live ∧ flag cabinet. Extractor injecté (tests)
  // → court-circuite la résolution (aucune lecture DB du flag).
  const extractor =
    injectedExtractor ??
    getFactureExtractor(await resolveExtractionModeForCabinet(input.cabinet_id));
  // 1. Détection de la nature du fichier (ADR 0024, cascade §1) puis décodage QR-bill.
  // Sans octets ici (le pipeline ne tient que le type_mime), on dérive une nature DÉGRADÉE
  // depuis le MIME pour la traçabilité. Le GATE du scan QR n'EXCLUT que les MIME bureautiques
  // connus (csv/xlsx/docx) ; un MIME absent/inconnu reste éligible (bénéfice du doute), pour
  // ne pas court-circuiter le QR à tort. Le décodage fin (couche texte PDF) reste possible
  // côté détecteur quand des octets sont disponibles (decode-qr.ts).
  const nature = natureFichierDepuisMime(input.type_mime);
  const qr: QrBillDecodeResult = mimePeutPorterQr(input.type_mime)
    ? await decodeQrFromDocument({ storagePath: input.storage_path ?? "" }, qrExtract)
    : { isSwissQrBill: false, data: null, valid: false, validations: [] };

  // 2. Extraction (stub par défaut ; live = Infomaniak chat_large).
  let result: Awaited<ReturnType<FactureExtractor["extract"]>>;
  try {
    result = await extractor.extract({
      nom_fichier: input.nom_fichier,
      ocr_text: input.ocr_text ?? null,
      qr_bill: qr,
      ...(input.type_mime ? { type_mime: input.type_mime } : {}),
    });
  } catch (err) {
    await traceFailedInvocation(input, extractor.mode, err);
    throw err;
  }
  const { proposal } = result;

  // 3. Traçabilité de l'invocation (une ligne par appel, même en stub).
  const [inv] = await db
    .insert(invocation)
    .values({
      cabinet_id: input.cabinet_id,
      context: "facture",
      invoked_by_module: "facture",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "document_id",
      input_document_id: input.document_id,
      model_used: result.model_used,
      prompt_version: result.prompt_version,
      status: "success",
      nb_items_extracted: 1,
      nb_items_with_anomalies: proposal.anomalies.length > 0 ? 1 : 0,
      // Trace la nature du fichier (ADR 0024 §3) à côté de la sortie brute de l'extracteur,
      // pour audit/debug du routage — sans nouvelle colonne DB.
      raw_output: { nature_fichier: nature, extraction: result.raw_output },
      total_duration_ms: result.duration_ms,
      cost_usd: result.usage?.cost_usd ?? "0",
      tokens_input: result.usage?.tokens_input ?? 0,
      tokens_output: result.usage?.tokens_output ?? 0,
    })
    .returning({ id: invocation.id });

  if (!inv) throw new Error("Échec de l'enregistrement de l'invocation facture");

  // 4. Proposition en attente de validation humaine.
  // ANTI-CLAIR (ADR 0013) : on retire l'IBAN de fournisseur_propose_data ET de qr_facture_data.
  const { iban: _ibanFournisseur, ...fournisseurSansIban } = proposal.fournisseur;
  const qrDataSansIban =
    proposal.qr_facture_data === null
      ? null
      : (({ iban: _ibanQr, ...rest }) => rest)(proposal.qr_facture_data);

  const [proposition] = await db
    .insert(propositionFacture)
    .values({
      cabinet_id: input.cabinet_id,
      client_id: input.client_id,
      document_id: input.document_id,
      extraction_invocation_id: inv.id,
      statut: "a_valider",
      fournisseur_propose_data: fournisseurSansIban,
      numero_facture_propose: proposal.numero_facture,
      type_propose: proposal.qr_facture_detecte ? "qr_facture" : "facture_standard",
      date_emission_proposee: proposal.date_emission,
      date_echeance_proposee: proposal.date_echeance,
      total_ht_propose: num(proposal.total_ht),
      total_tva_propose: num(proposal.total_tva),
      total_ttc_propose: num(proposal.total_ttc),
      montant_a_payer_propose: num(proposal.montant_a_payer),
      taux_tva_principal_propose: num(proposal.taux_tva_principal),
      devise_proposee: proposal.devise,
      categorie_proposee: proposal.categorie_comptable,
      qr_facture_detecte: proposal.qr_facture_detecte,
      qr_facture_data: qrDataSansIban,
      confiance_globale: num(proposal.confiance_globale),
      confiance_par_champ: proposal.confiance_par_champ,
      anomalies_detectees: proposal.anomalies,
    })
    .returning({ id: propositionFacture.id });

  if (!proposition) throw new Error("Échec de l'enregistrement de la proposition facture");

  return {
    invocation_id: inv.id,
    proposition_id: proposition.id,
    qr_detecte: proposal.qr_facture_detecte,
  };
}

// Trace une invocation facture en échec (best-effort) — symétrique de classify-document.
async function traceFailedInvocation(
  input: ExtraireFactureInput,
  mode: ExtractionMode,
  err: unknown,
): Promise<void> {
  const status = mapErrorToInvocationStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  try {
    await db.insert(invocation).values({
      cabinet_id: input.cabinet_id,
      context: "facture",
      invoked_by_module: "facture",
      invoked_by_user_id: input.invoked_by_user_id ?? null,
      input_type: "document_id",
      input_document_id: input.document_id,
      model_used: mode,
      prompt_version: mode === "live" ? FACTURE_PROMPT_VERSION : STUB_FACTURE_PROMPT_VERSION,
      status,
      nb_items_extracted: 0,
      error_message: message,
    });
  } catch {
    // Ne masque pas l'erreur d'extraction (re-levée par l'appelant).
  }
}
