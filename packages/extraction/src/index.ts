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
export { type ChatModelClient, InfomaniakClassifier } from "./infomaniak-classifier";
export {
  CLASSIFY_DOC_PROMPT_VERSION,
  type ClassifyDocRaw,
} from "./prompts/classification-doc";
export {
  type ChampsProposition,
  type ChampValidation,
  diffValidation,
  type ValidationDiff,
} from "./validation";
