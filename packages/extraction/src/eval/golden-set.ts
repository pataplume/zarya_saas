// Corpus annoté (golden set) pour l'évaluation du classifier documentaire.
//
// Vérité terrain : ce qu'un classifier correct DOIT produire (type, catégorie,
// période), indépendamment du moteur testé. Couvre FR / DE / IT — les trois
// langues officielles pertinentes pour une fiduciaire suisse (cf. prompt
// classification-doc.ts). ~55 cas (20 FR / 19 DE / 17 IT), extensible vers
// 50-100 cas/contexte (cf. extraction/CLAUDE.md § évaluation).
//
// NB : certains cas sont conçus pour que le Stub (regex FR sur le nom de fichier)
// échoue volontairement — c'est exactement ce que les métriques doivent révéler.

import type { CategorieDocument, ClassificationInput } from "../classifier";
import { TYPES_CONNUS } from "../prompts/classification-doc";

export type Lang = "fr" | "de" | "it";

export type TypeConnu = (typeof TYPES_CONNUS)[number];

export interface GoldenCase {
  id: string;
  lang: Lang;
  input: ClassificationInput;
  expected: {
    type: TypeConnu;
    categorie: CategorieDocument;
    periode: string | null;
  };
  note?: string;
}

// Vocabulaire de types connus, sous forme de Set (utilisé pour la détection
// d'hallucination de slug par l'évaluateur).
export const KNOWN_TYPES: ReadonlySet<string> = new Set(TYPES_CONNUS);

export const GOLDEN_SET: readonly GoldenCase[] = [
  // ─── Français ──────────────────────────────────────────────────────────────
  {
    id: "fr-01",
    lang: "fr",
    input: { nom_fichier: "releve_ubs_2026-04.pdf", ocr_text: "Relevé de compte UBS avril 2026" },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-04" },
  },
  {
    id: "fr-02",
    lang: "fr",
    input: {
      nom_fichier: "facture_fournisseur_alpha_2026-03.pdf",
      ocr_text: "Facture N° 2026-0312 — Alpha SA — TVA 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-03" },
  },
  {
    id: "fr-03",
    lang: "fr",
    input: {
      nom_fichier: "decompte_tva_2026-Q1.pdf",
      ocr_text: "Décompte TVA 1er trimestre 2026 — AFC",
    },
    expected: { type: "declaration_tva", categorie: "fiscal", periode: "2026-Q1" },
  },
  {
    id: "fr-04",
    lang: "fr",
    input: {
      nom_fichier: "declaration_impot_2025.pdf",
      ocr_text: "Déclaration d'impôt cantonal 2025",
    },
    expected: { type: "declaration_impot", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "fr-05",
    lang: "fr",
    input: {
      nom_fichier: "certificat_salaire_2025_dupont.pdf",
      ocr_text: "Certificat de salaire 2025 — Dupont Jean",
    },
    expected: { type: "certificat_salaire", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "fr-06",
    lang: "fr",
    input: {
      nom_fichier: "decompte_salaire_mars_2026.pdf",
      ocr_text: "Décompte de salaire mars 2026",
    },
    expected: { type: "decompte_salaire", categorie: "salaire", periode: "2026-03" },
    note: "Mois en toutes lettres : le stub ne peut pas déduire 2026-03 du nom.",
  },
  {
    id: "fr-07",
    lang: "fr",
    input: {
      nom_fichier: "contrat_travail_meunier.pdf",
      ocr_text: "Contrat de travail à durée indéterminée",
    },
    expected: { type: "contrat_travail", categorie: "salaire", periode: null },
  },
  {
    id: "fr-08",
    lang: "fr",
    input: {
      nom_fichier: "avenant_contrat_2026.pdf",
      ocr_text: "Avenant au contrat de travail — modification du taux",
    },
    expected: { type: "avenant_contrat", categorie: "salaire", periode: "2026" },
  },
  {
    id: "fr-09",
    lang: "fr",
    input: {
      nom_fichier: "attestation_avs_2025.pdf",
      ocr_text: "Attestation AVS/AI — caisse de compensation",
    },
    expected: { type: "declaration_avs", categorie: "salaire", periode: "2025" },
  },
  {
    id: "fr-10",
    lang: "fr",
    input: {
      nom_fichier: "extrait_rc_geneve.pdf",
      ocr_text: "Extrait du registre du commerce de Genève",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: null },
  },
  {
    id: "fr-11",
    lang: "fr",
    input: {
      nom_fichier: "scan_2026_03_12.pdf",
      ocr_text: "Document numérisé sans titre identifiable",
    },
    expected: { type: "a_classer", categorie: "autre", periode: "2026-03" },
    note: "Genuinement non classable : doit tomber en a_classer/autre.",
  },
  {
    id: "fr-12",
    lang: "fr",
    input: {
      nom_fichier: "extrait_postfinance_2026-02.pdf",
      ocr_text: "PostFinance — extrait de compte février 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-02" },
  },
  {
    id: "fr-13",
    lang: "fr",
    input: { nom_fichier: "qr-facture_swisscom_2026-01.pdf", ocr_text: "QR-facture Swisscom SA" },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-01" },
  },
  {
    id: "fr-14",
    lang: "fr",
    input: {
      nom_fichier: "decompte_tva_2025-Q4.pdf",
      ocr_text: "Décompte TVA 4e trimestre 2025",
    },
    expected: { type: "declaration_tva", categorie: "fiscal", periode: "2025-Q4" },
  },
  {
    id: "fr-15",
    lang: "fr",
    input: {
      nom_fichier: "procuration_mandat_2026.pdf",
      ocr_text: "Procuration et mandat de gestion",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: "2026" },
  },
  {
    id: "fr-16",
    lang: "fr",
    input: {
      nom_fichier: "releve_credit_suisse_2026-01.pdf",
      ocr_text: "Relevé Credit Suisse janvier 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-01" },
  },
  {
    id: "fr-17",
    lang: "fr",
    input: {
      nom_fichier: "releve_bcv_2026-05.pdf",
      ocr_text: "Banque Cantonale Vaudoise — relevé de compte mai 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-05" },
  },
  {
    id: "fr-18",
    lang: "fr",
    input: {
      nom_fichier: "note_honoraires_fiduciaire_2026.pdf",
      ocr_text: "Note d'honoraires — prestations comptables 2026 — TVA 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026" },
    note: "Note d'honoraires = facture entrante, sans token 'facture' dans le nom (stub probable miss).",
  },
  {
    id: "fr-19",
    lang: "fr",
    input: {
      nom_fichier: "certificat_salaire_2024_favre.pdf",
      ocr_text: "Certificat de salaire 2024 — Favre Marie",
    },
    expected: { type: "certificat_salaire", categorie: "fiscal", periode: "2024" },
  },
  {
    id: "fr-20",
    lang: "fr",
    input: {
      nom_fichier: "statuts_sa_2026.pdf",
      ocr_text: "Statuts de la société anonyme — capital-actions",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: "2026" },
    note: "Statuts : document administratif sans token reconnu par le stub.",
  },

  // ─── Deutsch ─────────────────────────────────────────────────────────────────
  {
    id: "de-01",
    lang: "de",
    input: { nom_fichier: "kontoauszug_ubs_2026-04.pdf", ocr_text: "Kontoauszug UBS April 2026" },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-04" },
  },
  {
    id: "de-02",
    lang: "de",
    input: {
      nom_fichier: "kontoauszug_raiffeisen_2026-03.pdf",
      ocr_text: "Raiffeisen Kontoauszug März 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-03" },
  },
  {
    id: "de-03",
    lang: "de",
    input: {
      nom_fichier: "rechnung_2026-02_meier.pdf",
      ocr_text: "Rechnung Nr. 2026-002 — Meier AG — MwSt 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-02" },
    note: "Aucun token FR dans le nom : le stub doit échouer.",
  },
  {
    id: "de-04",
    lang: "de",
    input: {
      nom_fichier: "mwst_abrechnung_2026-Q1.pdf",
      ocr_text: "MwSt-Abrechnung Q1 2026 — ESTV",
    },
    expected: { type: "declaration_tva", categorie: "fiscal", periode: "2026-Q1" },
  },
  {
    id: "de-05",
    lang: "de",
    input: {
      nom_fichier: "steuererklaerung_2025.pdf",
      ocr_text: "Steuererklärung 2025 — natürliche Personen",
    },
    expected: { type: "declaration_impot", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "de-06",
    lang: "de",
    input: { nom_fichier: "lohnausweis_2025_keller.pdf", ocr_text: "Lohnausweis 2025 — Keller" },
    expected: { type: "certificat_salaire", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "de-07",
    lang: "de",
    input: {
      nom_fichier: "lohnabrechnung_2026-03.pdf",
      ocr_text: "Lohnabrechnung März 2026",
    },
    expected: { type: "decompte_salaire", categorie: "salaire", periode: "2026-03" },
  },
  {
    id: "de-08",
    lang: "de",
    input: {
      nom_fichier: "arbeitsvertrag_huber.pdf",
      ocr_text: "Arbeitsvertrag — unbefristet",
    },
    expected: { type: "contrat_travail", categorie: "salaire", periode: null },
  },
  {
    id: "de-09",
    lang: "de",
    input: {
      nom_fichier: "ahv_bescheinigung_2025.pdf",
      ocr_text: "AHV/IV Ausgleichskasse — Bescheinigung",
    },
    expected: { type: "declaration_avs", categorie: "salaire", periode: "2025" },
  },
  {
    id: "de-10",
    lang: "de",
    input: {
      nom_fichier: "handelsregisterauszug_zuerich.pdf",
      ocr_text: "Handelsregisterauszug Kanton Zürich",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: null },
  },
  {
    id: "de-11",
    lang: "de",
    input: {
      nom_fichier: "invoice_2026-01_acme.pdf",
      ocr_text: "Invoice No. 2026-1 — ACME GmbH — VAT 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-01" },
  },
  {
    id: "de-12",
    lang: "de",
    input: {
      nom_fichier: "dokument_scan_2026.pdf",
      ocr_text: "Eingescanntes Dokument ohne Titel",
    },
    expected: { type: "a_classer", categorie: "autre", periode: "2026" },
  },
  {
    id: "de-13",
    lang: "de",
    input: {
      nom_fichier: "nachtrag_arbeitsvertrag_2026.pdf",
      ocr_text: "Nachtrag zum Arbeitsvertrag — Pensumänderung",
    },
    expected: { type: "avenant_contrat", categorie: "salaire", periode: "2026" },
  },
  {
    id: "de-14",
    lang: "de",
    input: {
      nom_fichier: "kontoauszug_postfinance_2026-02.pdf",
      ocr_text: "PostFinance Kontoauszug Februar 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-02" },
  },
  {
    id: "de-15",
    lang: "de",
    input: { nom_fichier: "vollmacht_2026.pdf", ocr_text: "Vollmacht zur Vertretung" },
    expected: { type: "document_administratif", categorie: "administratif", periode: "2026" },
  },
  {
    id: "de-16",
    lang: "de",
    input: {
      nom_fichier: "kontoauszug_zkb_2026-05.pdf",
      ocr_text: "Zürcher Kantonalbank — Kontoauszug Mai 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-05" },
  },
  {
    id: "de-17",
    lang: "de",
    input: {
      nom_fichier: "honorarrechnung_treuhand_2026.pdf",
      ocr_text: "Honorarrechnung — Treuhandleistungen 2026 — MwSt 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026" },
    note: "Honorarrechnung = facture entrante ; aucun token FR (stub probable miss).",
  },
  {
    id: "de-18",
    lang: "de",
    input: {
      nom_fichier: "lohnabrechnung_mai_huber.pdf",
      ocr_text: "Lohnabrechnung Mai 2026 — Huber",
    },
    expected: { type: "decompte_salaire", categorie: "salaire", periode: "2026-05" },
    note: "Monat ausgeschrieben : période non déductible du nom.",
  },
  {
    id: "de-19",
    lang: "de",
    input: {
      nom_fichier: "steuererklaerung_juristische_personen_2024.pdf",
      ocr_text: "Steuererklärung 2024 — juristische Personen",
    },
    expected: { type: "declaration_impot", categorie: "fiscal", periode: "2024" },
  },

  // ─── Italiano ────────────────────────────────────────────────────────────────
  {
    id: "it-01",
    lang: "it",
    input: {
      nom_fichier: "estratto_conto_ubs_2026-04.pdf",
      ocr_text: "Estratto conto UBS aprile 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-04" },
  },
  {
    id: "it-02",
    lang: "it",
    input: {
      nom_fichier: "fattura_2026-02_rossi.pdf",
      ocr_text: "Fattura n. 2026-02 — Rossi SA — IVA 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-02" },
  },
  {
    id: "it-03",
    lang: "it",
    input: {
      nom_fichier: "rendiconto_iva_2026-Q1.pdf",
      ocr_text: "Rendiconto IVA primo trimestre 2026 — AFC",
    },
    expected: { type: "declaration_tva", categorie: "fiscal", periode: "2026-Q1" },
    note: "Le token AFC fait dériver le stub vers declaration_impot (catégorie ok, type faux).",
  },
  {
    id: "it-04",
    lang: "it",
    input: {
      nom_fichier: "dichiarazione_imposte_2025.pdf",
      ocr_text: "Dichiarazione delle imposte 2025",
    },
    expected: { type: "declaration_impot", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "it-05",
    lang: "it",
    input: {
      nom_fichier: "certificato_salario_2025.pdf",
      ocr_text: "Certificato di salario 2025",
    },
    expected: { type: "certificat_salaire", categorie: "fiscal", periode: "2025" },
  },
  {
    id: "it-06",
    lang: "it",
    input: { nom_fichier: "busta_paga_2026-03.pdf", ocr_text: "Busta paga marzo 2026" },
    expected: { type: "decompte_salaire", categorie: "salaire", periode: "2026-03" },
  },
  {
    id: "it-07",
    lang: "it",
    input: {
      nom_fichier: "contratto_lavoro_bianchi.pdf",
      ocr_text: "Contratto di lavoro a tempo indeterminato",
    },
    expected: { type: "contrat_travail", categorie: "salaire", periode: null },
  },
  {
    id: "it-08",
    lang: "it",
    input: {
      nom_fichier: "attestazione_avs_2025.pdf",
      ocr_text: "Attestazione AVS/AI — cassa di compensazione",
    },
    expected: { type: "declaration_avs", categorie: "salaire", periode: "2025" },
  },
  {
    id: "it-09",
    lang: "it",
    input: {
      nom_fichier: "estratto_registro_commercio_lugano.pdf",
      ocr_text: "Estratto del registro di commercio — Lugano",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: null },
  },
  {
    id: "it-10",
    lang: "it",
    input: {
      nom_fichier: "documento_scansione_2026.pdf",
      ocr_text: "Documento scansionato senza titolo",
    },
    expected: { type: "a_classer", categorie: "autre", periode: "2026" },
  },
  {
    id: "it-11",
    lang: "it",
    input: {
      nom_fichier: "fattura_swisscom_2026-05.pdf",
      ocr_text: "Fattura Swisscom maggio 2026",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026-05" },
  },
  {
    id: "it-12",
    lang: "it",
    input: {
      nom_fichier: "estratto_conto_raiffeisen_2026-03.pdf",
      ocr_text: "Estratto conto Raiffeisen marzo 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-03" },
  },
  {
    id: "it-13",
    lang: "it",
    input: {
      nom_fichier: "estratto_conto_bancastato_2026-05.pdf",
      ocr_text: "Banca dello Stato del Cantone Ticino — estratto conto maggio 2026",
    },
    expected: { type: "releve_bancaire", categorie: "bancaire", periode: "2026-05" },
  },
  {
    id: "it-14",
    lang: "it",
    input: {
      nom_fichier: "fattura_onorari_2026.pdf",
      ocr_text: "Fattura per onorari — prestazioni fiduciarie 2026 — IVA 7.7%",
    },
    expected: { type: "facture_fournisseur", categorie: "commercial", periode: "2026" },
  },
  {
    id: "it-15",
    lang: "it",
    input: {
      nom_fichier: "busta_paga_maggio_ferrari.pdf",
      ocr_text: "Busta paga maggio 2026 — Ferrari",
    },
    expected: { type: "decompte_salaire", categorie: "salaire", periode: "2026-05" },
    note: "Mese per esteso : periodo non deducibile dal nome.",
  },
  {
    id: "it-16",
    lang: "it",
    input: {
      nom_fichier: "modifica_contratto_lavoro_2026.pdf",
      ocr_text: "Modifica del contratto di lavoro — variazione della percentuale",
    },
    expected: { type: "avenant_contrat", categorie: "salaire", periode: "2026" },
  },
  {
    id: "it-17",
    lang: "it",
    input: {
      nom_fichier: "procura_2026.pdf",
      ocr_text: "Procura per la rappresentanza",
    },
    expected: { type: "document_administratif", categorie: "administratif", periode: "2026" },
  },
];
