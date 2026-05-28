// @zarya/extraction — Phase 2 : pipeline IA générique (proposition → validation → entité)

export {
  BedrockClassifier,
  type CategorieDocument,
  type ClassificationInput,
  type ClassificationProposal,
  type ClassificationResult,
  type Classifier,
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
  type ChampsProposition,
  type ChampValidation,
  diffValidation,
  type ValidationDiff,
} from "./validation";
