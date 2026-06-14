/**
 * C4.1 — Libellés anti-jargon (côté fiduciaire `/app` uniquement).
 *
 * Module partagé qui mappe les slugs d'enum (statuts, types, catégories, sources,
 * anomalies…) vers des libellés FR lisibles. Objectif : aucun slug brut affiché à
 * l'écran (ex. `a_valider`, `en_retard`, `releve_bancaire`).
 *
 * Règles :
 *  - chaque helper a la forme `(slug) => string` et **retombe sur le slug** en cas de
 *    valeur inconnue (jamais d'exception, jamais de chaîne vide) ;
 *  - les badges utilisent une **famille** (icône + texte + couleur), jamais la couleur
 *    seule (cf. `apps/web/CLAUDE.md` § « pas de couleur seule ») ;
 *  - ce module ne concerne QUE le portail fiduciaire `/app` ; le portail client
 *    `/espace` a son propre vocabulaire (Chantier 5).
 *
 * Les maps sont volontairement permissives (`Record<string, …>`) : un slug absent du
 * catalogue ne casse rien, il s'affiche tel quel (visible et corrigeable, pas planté).
 */

// ─── Familles de badge (couleur + intention), réutilisées par tout `/app` ────────
//
// Une famille = un jeu de classes Tailwind cohérent (fond + texte + ring) déjà en
// place dans les écrans existants. Toujours accompagner d'un texte (le libellé) — la
// couleur n'est jamais le seul porteur d'information.

export type FamilleBadge =
  | "neutre"
  | "info"
  | "attention"
  | "succes"
  | "danger"
  | "encours"
  | "termine";

export const STYLE_FAMILLE: Record<FamilleBadge, string> = {
  neutre: "bg-slate-100 text-slate-600 ring-slate-500/20",
  info: "bg-blue-50 text-blue-700 ring-blue-600/20",
  attention: "bg-amber-50 text-amber-700 ring-amber-600/20",
  succes: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  encours: "bg-violet-50 text-violet-700 ring-violet-600/20",
  termine: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

/** Renvoie le jeu de classes Tailwind d'une famille (fond + texte + ring). */
export function styleFamille(famille: FamilleBadge): string {
  return STYLE_FAMILLE[famille];
}

// ─── Documents : statut d'upload (doc.upload_brut.statut, hub Documents) ──────────

const UPLOAD_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  recu: { label: "Classification en attente", famille: "attention" },
  en_classification: { label: "En classification", famille: "encours" },
  a_valider: { label: "À valider", famille: "attention" },
  valide: { label: "Validé", famille: "succes" },
  rejete: { label: "Rejeté", famille: "danger" },
  doublon: { label: "Doublon", famille: "neutre" },
  erreur: { label: "Échec", famille: "danger" },
};

/** Libellé du statut d'un upload (hub Documents). Fallback = le slug. */
export function libelleStatutUpload(slug: string): string {
  return UPLOAD_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille de badge d'un statut d'upload. Fallback = slug en famille neutre. */
export function badgeStatutUpload(slug: string): { label: string; famille: FamilleBadge } {
  return UPLOAD_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── Documents : statut de classement d'un document validé (doc.statut_classement) ─

const DOC_STATUT_CLASSEMENT: Record<string, { label: string; famille: FamilleBadge }> = {
  auto: { label: "Classé automatiquement", famille: "encours" },
  valide_humain: { label: "Validé", famille: "succes" },
  corrige_humain: { label: "Corrigé", famille: "succes" },
  manuel: { label: "Saisi manuellement", famille: "neutre" },
};

/** Libellé du statut de classement d'un document. Fallback = « Classé » si vide, sinon slug. */
export function libelleStatutClassement(slug: string): string {
  return DOC_STATUT_CLASSEMENT[slug]?.label ?? slug;
}

/** Libellé + famille du statut de classement. Fallback = « Classé » en famille neutre. */
export function badgeStatutClassement(slug: string): { label: string; famille: FamilleBadge } {
  return DOC_STATUT_CLASSEMENT[slug] ?? { label: slug || "Classé", famille: "neutre" };
}

// ─── Documents : statut d'un email capté (doc.email_brut.statut) ──────────────────

const EMAIL_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  recu: { label: "En attente", famille: "info" },
  traite: { label: "Traité", famille: "succes" },
  ignore: { label: "Sans pièce utile", famille: "neutre" },
  erreur: { label: "Erreur", famille: "danger" },
};

/** Libellé du statut d'un email capté. Fallback = le slug. */
export function libelleStatutEmail(slug: string): string {
  return EMAIL_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'un email capté. Fallback = slug en famille neutre. */
export function badgeStatutEmail(slug: string): { label: string; famille: FamilleBadge } {
  return EMAIL_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── Documents : catégorie (doc.document.categorie) ───────────────────────────────

const DOC_CATEGORIE: Record<string, string> = {
  bancaire: "Bancaire",
  fiscal: "Fiscal",
  salaire: "Salaire",
  commercial: "Commercial",
  administratif: "Administratif",
  autre: "Autre",
};

/** Libellé de la catégorie d'un document. Fallback = le slug. */
export function libelleCategorieDocument(slug: string): string {
  return DOC_CATEGORIE[slug] ?? slug;
}

// ─── Documents : type (catalogue crm.standard_type_document, slugs fréquents) ──────

const DOC_TYPE: Record<string, string> = {
  facture: "Facture",
  facture_standard: "Facture",
  factures_achats: "Factures d'achats",
  factures_ventes: "Factures de ventes",
  qr_facture: "QR-facture",
  avoir: "Avoir",
  acompte: "Acompte",
  releve_bancaire: "Relevé bancaire",
  declaration_tva: "Déclaration TVA",
  fiche_salaire: "Fiche de salaire",
  decompte_salaire: "Décompte de salaire",
  certificat_salaire: "Certificat de salaire",
  contrat: "Contrat",
  attestation: "Attestation",
  autre: "Autre",
};

/** Libellé court d'un type de document (catalogue). Fallback = le slug. */
export function libelleTypeDocument(slug: string): string {
  return DOC_TYPE[slug] ?? slug;
}

// ─── Documents : source d'ingestion (doc.upload_brut.source) ──────────────────────

const SOURCE_INGESTION: Record<string, string> = {
  email_microsoft: "Email",
  email_autre: "Email",
  nas: "NAS",
  upload_fiduciaire: "Upload",
  upload_client: "Client",
  api: "API",
  import_manuel: "Import",
};

/** Libellé de la source d'ingestion d'un document. Fallback = le slug. */
export function libelleSourceIngestion(slug: string): string {
  return SOURCE_INGESTION[slug] ?? slug;
}

// ─── Échéances : statut (crm.echeance.statut) ─────────────────────────────────────

const ECHEANCE_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  a_venir: { label: "À venir", famille: "neutre" },
  imminente: { label: "Imminente", famille: "attention" },
  en_retard: { label: "En retard", famille: "danger" },
  reportee: { label: "Reportée", famille: "info" },
  traitee: { label: "Traitée", famille: "succes" },
  couverte: { label: "Couverte", famille: "succes" },
  annulee: { label: "Annulée", famille: "termine" },
};

/** Libellé du statut d'une échéance. Fallback = le slug. */
export function libelleStatutEcheance(slug: string): string {
  return ECHEANCE_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'une échéance. Fallback = slug en famille neutre. */
export function badgeStatutEcheance(slug: string): { label: string; famille: FamilleBadge } {
  return ECHEANCE_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── Échéances : type (crm.echeance.type) ─────────────────────────────────────────

const ECHEANCE_TYPE: Record<string, string> = {
  fiscale: "Fiscale",
  tva: "TVA",
  bouclement: "Bouclement",
  salaire: "Salaire",
  relance_documents: "Relance documents",
  personnalisee: "Personnalisée",
};

/** Libellé du type d'une échéance. Fallback = le slug. */
export function libelleTypeEcheance(slug: string): string {
  return ECHEANCE_TYPE[slug] ?? slug;
}

// ─── Factures : statut (facture.facture.statut) ───────────────────────────────────

const FACTURE_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  en_attente_validation: { label: "À valider", famille: "attention" },
  validee: { label: "Validée", famille: "succes" },
  exportee: { label: "Exportée", famille: "info" },
  payee: { label: "Payée", famille: "succes" },
  annulee: { label: "Annulée", famille: "termine" },
};

/** Libellé du statut d'une facture. Fallback = le slug. */
export function libelleStatutFacture(slug: string): string {
  return FACTURE_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'une facture. Fallback = slug en famille neutre. */
export function badgeStatutFacture(slug: string): { label: string; famille: FamilleBadge } {
  return FACTURE_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── Factures : statut d'une proposition d'extraction (extraction.proposition_*) ───

const PROPOSITION_STATUT: Record<string, string> = {
  a_valider: "À valider",
  validee: "Validée",
  rejetee: "Rejetée",
};

/** Libellé du statut d'une proposition d'extraction. Fallback = le slug. */
export function libelleStatutProposition(slug: string): string {
  return PROPOSITION_STATUT[slug] ?? slug;
}

// ─── Factures : anomalies d'extraction (extraction) ──────────────────────────────

/** Libellés lisibles des anomalies (pas de slug brut côté UI). Fallback = le slug. */
export const ANOMALIE_LABEL: Record<string, string> = {
  incoherence_qr_ia_iban: "⚠️ IBAN du QR ≠ IBAN lu sur la facture — fraude possible (RIB substitué)",
  iban_invalide: "IBAN invalide",
  ide_invalide: "IDE fournisseur invalide",
  tva_incoherente: "TVA incohérente (HT + TVA ≠ TTC)",
  taux_tva_invalide: "Taux de TVA non standard (CH)",
  devise_inconnue: "Devise inconnue",
  montant_invalide: "Montant invalide",
  montant_eleve: "Montant élevé (à vérifier)",
  date_emission_implausible: "Date d'émission peu plausible",
  echeance_avant_emission: "Échéance avant l'émission",
  extraction_stub: "Extraction de démonstration (non IA)",
};

/** Libellé lisible d'une anomalie d'extraction. Fallback = le slug. */
export function libelleAnomalie(slug: string): string {
  return ANOMALIE_LABEL[slug] ?? slug;
}

// ─── Salaire : statut de période (salaire.periode_salaire.statut) ─────────────────
//
// `validee` se dit « Validée client » dans les tableaux où l'on suit le cycle vu du
// cabinet (la validation est faite par le client). Le dossier client peut préférer
// « Validée » court via `libelleStatutPeriode`. La nuance reste dans le même module.

const PERIODE_STATUT: Record<string, string> = {
  non_demandee: "Non demandée",
  en_attente: "En attente",
  relancee: "Relancée",
  validee: "Validée client",
  en_retard: "En retard",
  exportee: "Exportée",
  cloturee: "Clôturée",
  non_applicable: "Sans objet",
};

/** Libellé du statut d'une période salaire. Fallback = le slug. */
export function libelleStatutPeriode(slug: string): string {
  return PERIODE_STATUT[slug] ?? slug;
}

// ─── Salaire : statut d'un employé au référentiel (salaire.employe.statut) ────────

const EMPLOYE_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  propose: { label: "Proposé", famille: "neutre" },
  actif: { label: "Actif", famille: "succes" },
  sorti: { label: "Sorti", famille: "attention" },
  archive: { label: "Archivé", famille: "termine" },
};

/** Libellé du statut d'un employé. Fallback = le slug. */
export function libelleStatutEmploye(slug: string): string {
  return EMPLOYE_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'un employé. Fallback = slug en famille neutre. */
export function badgeStatutEmploye(slug: string): { label: string; famille: FamilleBadge } {
  return EMPLOYE_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── CRM : statut d'un client (crm.client.statut) ─────────────────────────────────

const CLIENT_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  prospect: { label: "Prospect", famille: "info" },
  actif: { label: "Actif", famille: "succes" },
  inactif: { label: "Inactif", famille: "neutre" },
  archive: { label: "Archivé", famille: "termine" },
};

/** Libellé du statut d'un client. Fallback = le slug. */
export function libelleStatutClient(slug: string): string {
  return CLIENT_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'un client. Fallback = slug en famille neutre. */
export function badgeStatutClient(slug: string): { label: string; famille: FamilleBadge } {
  return CLIENT_STATUT[slug] ?? { label: slug, famille: "neutre" };
}

// ─── CRM : type d'un client (crm.client.type) ─────────────────────────────────────

const CLIENT_TYPE: Record<string, string> = {
  pme: "PME",
  independant: "Indépendant",
  prive: "Privé",
  association: "Association",
};

/** Libellé du type d'un client. Fallback = le slug. */
export function libelleTypeClient(slug: string): string {
  return CLIENT_TYPE[slug] ?? slug;
}

// ─── CRM : service rendu au client (crm.client_service.type) ──────────────────────

const SERVICE_TYPE: Record<string, string> = {
  comptabilite: "Comptabilité",
  fiscalite: "Fiscalité",
  salaires: "Salaires",
  tva: "TVA",
  bouclement: "Bouclement",
  conseil: "Conseil",
};

/** Libellé d'un service rendu au client. Fallback = le slug. */
export function libelleService(slug: string): string {
  return SERVICE_TYPE[slug] ?? slug;
}

// ─── CRM : niveau de risque (crm.risque.niveau, barème provisoire ADR 0015) ───────
//
// Symbole + couleur + texte (jamais couleur seule). `label` court ; les écrans qui
// veulent « Risque faible » préfixent eux-mêmes.

const RISQUE: Record<string, { label: string; famille: FamilleBadge; symbole: string }> = {
  faible: { label: "Faible", famille: "succes", symbole: "●" },
  moyen: { label: "Moyen", famille: "attention", symbole: "◐" },
  eleve: { label: "Élevé", famille: "attention", symbole: "▲" },
  critique: { label: "Critique", famille: "danger", symbole: "■" },
};

/** Libellé du niveau de risque. Fallback = le slug. */
export function libelleRisque(slug: string): string {
  return RISQUE[slug]?.label ?? slug;
}

/** Libellé + famille + symbole du niveau de risque. Fallback = slug en famille neutre, « • ». */
export function badgeRisque(slug: string): {
  label: string;
  famille: FamilleBadge;
  symbole: string;
} {
  return RISQUE[slug] ?? { label: slug, famille: "neutre", symbole: "•" };
}

// ─── CRM : paramètres comptables (crm.param_comptable) ────────────────────────────

const LOGICIEL_COMPTABLE: Record<string, string> = {
  bexio: "Bexio",
  abacus: "Abacus",
  cresus: "Crésus",
  winbiz: "WinBIZ",
  banana: "Banana",
  excel: "Excel",
  officemaker: "OfficeMaker",
  autre: "Autre",
};

/** Libellé d'un logiciel comptable. Fallback = le slug. */
export function libelleLogicielComptable(slug: string): string {
  return LOGICIEL_COMPTABLE[slug] ?? slug;
}

const LOGICIEL_PAIE: Record<string, string> = {
  bexio_payroll: "Bexio Payroll",
  cresus_salaires: "Crésus Salaires",
  winbiz_salaires: "WinBIZ Salaires",
  abacus_lohn: "Abacus Lohn",
  officemaker_staff: "OfficeMaker Staff",
  swissdec: "Swissdec",
  autre: "Autre",
  aucun: "Aucun",
};

/** Libellé d'un logiciel de paie. Fallback = le slug. */
export function libelleLogicielPaie(slug: string): string {
  return LOGICIEL_PAIE[slug] ?? slug;
}

const MODE_TRANSMISSION: Record<string, string> = {
  email: "Email",
  nas_partage: "Partage NAS",
  connecteur_logiciel: "Connecteur logiciel",
  physique: "Remise physique",
};

/** Libellé d'un mode de transmission des pièces. Fallback = le slug. */
export function libelleModeTransmission(slug: string): string {
  return MODE_TRANSMISSION[slug] ?? slug;
}

// ─── Conformité : statut d'une demande RGPD (crm.demande_suppression.statut) ──────

const DEMANDE_RGPD_STATUT: Record<string, { label: string; famille: FamilleBadge }> = {
  nouvelle: { label: "Nouvelle", famille: "attention" },
  en_cours: { label: "En cours", famille: "info" },
  traitee: { label: "Traitée", famille: "succes" },
  rejetee: { label: "Rejetée", famille: "neutre" },
};

/** Libellé du statut d'une demande RGPD. Fallback = le slug. */
export function libelleStatutDemandeRgpd(slug: string): string {
  return DEMANDE_RGPD_STATUT[slug]?.label ?? slug;
}

/** Libellé + famille du statut d'une demande RGPD. Fallback = slug en famille neutre. */
export function badgeStatutDemandeRgpd(slug: string): { label: string; famille: FamilleBadge } {
  return DEMANDE_RGPD_STATUT[slug] ?? { label: slug, famille: "neutre" };
}
