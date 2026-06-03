// @zarya/extraction — Phase 2 : pipeline IA générique (proposition → validation → entité)

export {
  buildNomStandardise,
  type NomStandardise,
  type NomStandardiseInput,
  slugify,
} from "./build-nom-standardise";
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
  ANNEE_MIN_PLAUSIBLE,
  detectFactureAnomalies,
  type FactureAnomalyInput,
  isValidIde,
  PLAFOND_MONTANT,
  SEUIL_MONTANT_ELEVE,
  TAUX_TVA_CH_VALIDES,
} from "./detect-facture-anomalies";
export {
  CATEGORIE_PAR_CHAMP,
  type CategorieChamp,
  CHAMPS_OBLIGATOIRES_SWISSDEC,
  CHAMPS_SENSIBLES_VAULT,
  clefEntete,
  masquerAvs,
  masquerIban,
  masquerSensible,
  NOMS_CHAMP,
  type NomChamp,
  normaliserEntete,
} from "./employe-fields";
export {
  type ArchiverEmployeInput,
  appliquerModificationReferentiel,
  archiverEmploye,
  type EntreeReferentielInput,
  enregistrerEntreeReferentiel,
  type LifecycleResult,
  type ModificationReferentielInput,
  type SortieEmployeInput,
  sortirEmploye,
  type TypeModificationReferentiel,
} from "./employe-lifecycle";
export {
  type ExportResult,
  exporterFacturesValidees,
  type FactureExportRow,
  genererExportCsv,
} from "./export-facture-csv";
export {
  assemblerLignesExport,
  buildExportXlsx,
  type GenererExportInput,
  type GenererExportResult,
  genererExportPeriode,
  type LignesExport,
  toCsvSalaire,
} from "./export-salaire";
export {
  buildManualProposal,
  type ChampPropose,
  DETERMINISTE_PROMPT_VERSION,
  DeterministicEmployesExtractor,
  type EmployeProposal,
  type EmployesExtractionInput,
  type EmployesExtractionResult,
  type EmployesExtractor,
  getEmployesExtractor,
  type SaisieManuelle,
} from "./extract-employes";
export {
  type AjouterEmployeManuelInput,
  ajouterEmployeManuel,
  type ExtraireEmployesInput,
  type ExtraireEmployesResult,
  extraireEmployesDepuisFichier,
} from "./extract-employes-pipeline";
export {
  applyQrBill,
  coerceDevise,
  type Devise,
  FACTURE_PROMPT_VERSION,
  type FactureExtractionInput,
  type FactureExtractionResult,
  type FactureExtractionUsage,
  type FactureExtractor,
  type FactureFournisseurProposal,
  type FactureProposal,
  getFactureExtractor,
  STUB_FACTURE_PROMPT_VERSION,
  StubFactureExtractor,
  toFactureProposal,
  withDetectedAnomalies,
} from "./extract-facture";
export {
  type ExtraireFactureInput,
  type ExtraireFactureResult,
  extraireFactureDepuisDocument,
} from "./extract-facture-pipeline";
export {
  couvrirEcheancesParDocumentAttendu,
  type FinaliserDocumentInput,
  type FinaliserDocumentResult,
  finaliserDocument,
  type RecalculRisqueResult,
  recalculerRisqueClient,
} from "./finalize-document";
export {
  FinalisationBloqueeError,
  type FinaliserPropositionEmployeInput,
  type FinaliserPropositionEmployeResult,
  finaliserPropositionEmploye,
} from "./finalize-employe";
export {
  type DeviseFacture,
  type FinaliserFactureInput,
  type FinaliserFactureResult,
  type FournisseurValide,
  finaliserFacture,
  type TypeFacture,
} from "./finalize-facture";
export {
  deriverDateLimite,
  type GenererPeriodesInput,
  type GenererPeriodesResult,
  genererPeriodesMensuelles,
  joursDansMois,
  moisPrecedent,
} from "./generer-periodes";
export { type ChatModelClient, InfomaniakClassifier } from "./infomaniak-classifier";
export { InfomaniakFactureExtractor } from "./infomaniak-facture-extractor";
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
  type CelluleExtraite,
  detecterFormat,
  type FormatFichier,
  type LigneEmploye,
  type ParseEmployesInput,
  type ParseEmployesResult,
  parseCsv,
  parseCsvEmployes,
  parseEmployesFile,
  parseXlsx,
} from "./parse-employes-file";
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
  DEVISES,
  FACTURE_JSON_SCHEMA,
  type FactureExtractRaw,
  TAUX_TVA_CH_2026,
} from "./prompts/facture";
export {
  decodeQrFromDocument,
  isQrIban,
  isValidCreditorReference,
  isValidIban,
  isValidQrReference,
  normalizeIban,
  parseSwissQrBill,
  type QrBillCurrency,
  type QrBillDecodeResult,
  type QrBillParty,
  type QrBillValidation,
  type QrDocumentSource,
  type QrPayloadExtractor,
  type ReferenceType,
  type SwissQrBill,
  unavailableQrPayloadExtractor,
} from "./qr-bill";
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
  buildNotificationTemplate,
  type EmailTemplate,
  type EnvoyerNotificationInput,
  type EnvoyerNotificationResult,
  envoyerNotificationCycle,
  type TemplateContexte,
  type TypeNotificationCycle,
} from "./salaire-notifications";
export {
  buildRelanceTemplate,
  type EnvoyerRelanceInput,
  type EnvoyerRelanceResult,
  envoyerRelanceSalaire,
  escaladerPeriodesEnRetard,
  type GenererBrouillonsRelancesInput,
  genererBrouillonsRelancesSalaire,
  type RelanceContexte,
} from "./salaire-relances";
export {
  assertOnboardingTermine,
  type CompletudeOnboarding,
  enregistrerActiviteOnboarding,
  evaluerCompletude,
  getProgressionOnboarding,
  listerSessionsARelancer,
  OnboardingNonTermineError,
  onboardingEstTermine,
  type ProgressionOnboarding,
  type SessionARelancer,
  type StatutSessionOnboarding,
  type TerminerOnboardingResult,
  terminerOnboarding,
} from "./session-onboarding";
export {
  type ConfirmerImportInput,
  type ConfirmerImportResult,
  confirmerImportExport,
  type MarquerTelechargeInput,
  marquerExportTelecharge,
} from "./suivi-export";
export {
  type ChampsProposition,
  type ChampValidation,
  diffValidation,
  type ValidationDiff,
} from "./validation";
export {
  type ChampPourFinalisation,
  champsBloquants,
  detectDoublonsParIdentite,
  type IdentiteEmploye,
  isValidAvs,
} from "./valider-employe";
