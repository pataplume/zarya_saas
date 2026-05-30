// @zarya/extraction — Phase 2 : pipeline IA générique (proposition → validation → entité)

export {
  type CategorieDocument,
  type ClassificationInput,
  type ClassificationProposal,
  type ClassificationResult,
  type ClassificationUsage,
  type Classifier,
  ExtractionError,
  type ExtractionMode,
  ExtractionNotImplementedError,
  getClassifier,
  resolveExtractionMode,
  STUB_PROMPT_VERSION,
  StubClassifier,
} from "./classifier";
export {
  type ClassifyDocumentInput,
  type ClassifyDocumentResult,
  classifyDocument,
} from "./classify-document";
export {
  BAREME_RISQUE_VERSION,
  computeScoreRisque,
  type NiveauRisque,
  POIDS_DOCUMENT_EN_RETARD,
  POIDS_DOCUMENT_MANQUANT,
  POIDS_ECHEANCE_EN_RETARD,
  type RisqueFacteurs,
  type RisqueScore,
  type RisqueSignals,
  SEUIL_RISQUE_CRITIQUE,
} from "./compute-risque";
export {
  type AutoClassementSignals,
  decideAutoClassement,
  type PolitiqueClassement,
  SEUIL_AUTO_AGGRESSIVE,
  SEUIL_AUTO_HYBRIDE,
} from "./decide-auto-classement";
export {
  type FinaliserDocumentInput,
  type FinaliserDocumentResult,
  finaliserDocument,
} from "./finalize-document";
export { type ChatModelClient, InfomaniakClassifier } from "./infomaniak-classifier";
export {
  type AttenduRow,
  type DocumentSignals,
  type FrequenceAttendu,
  matchDocumentAttendu,
  periodeFrequence,
} from "./match-document-attendu";
export {
  type ExtractTextInput,
  type ExtractTextOptions,
  type ExtractTextResult,
  extractText,
  OCR_PROMPT_VERSION,
  type OcrSource,
  type VisionModelClient,
} from "./ocr";
export {
  type OcrDocumentInput,
  type OcrDocumentResult,
  ocrDocument,
} from "./ocr-document";
export {
  extractPdfText,
  isPdfTextUsable,
  type PdfExtractFn,
  PdfParseError,
  type PdfTextQuality,
  type PdfTextQualityOptions,
  type PdfTextResult,
} from "./pdf-text";
export {
  CLASSIFY_DOC_PROMPT_VERSION,
  type ClassifyDocRaw,
} from "./prompts/classification-doc";
export {
  type ClientCandidat,
  type ClientPalier,
  type ClientResolution,
  type ClientRow,
  type ClientSignals,
  type ContactRow,
  extractIde,
  resolveClientCandidates,
  SEUIL_RATTACHEMENT_AUTO,
  SEUIL_RATTACHEMENT_PROPOSER,
  scoreClients,
} from "./resolve-client";
export {
  type ChampsProposition,
  type ChampValidation,
  diffValidation,
  type ValidationDiff,
} from "./validation";
