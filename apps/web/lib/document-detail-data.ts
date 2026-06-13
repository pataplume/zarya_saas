// C2.3 — Données de la fiche document (/app/documents/[id]).
// Helper de lecture testable, scopé STRICTEMENT par (cabinet_id, document_id).
//
// Sécurité (CRITIQUE) : le `db` applicatif se connecte en service role et BYPASSE
// la RLS (ADR 0005 addendum). La frontière de sécurité réelle sur le chemin app
// repose donc ENTIÈREMENT sur le filtre `cabinet_id` discipliné dans CHAQUE requête
// — jamais une valeur issue d'URL/body sans contrôle. La requête d'identité
// (doc.document scopé cabinet) est la porte : si elle ne renvoie rien, on retourne
// null → la page rend un 404 indistinct, sans fuite d'existence cross-tenant.
//
// AUCUNE colonne ultra-sensible (IBAN/AVS/tokens) n'est projetée ici : ni la
// proposition (fournisseur_propose_data filtré aux champs sûrs) ni la facture
// (iban_paiement_vault_id ignoré).

import {
  client,
  db,
  document,
  echeance,
  facture,
  fournisseur,
  propositionFacture,
} from "@zarya/db";
import { and, desc, eq, sql } from "drizzle-orm";

// ─── Types exposés ────────────────────────────────────────────────────────────

export interface DocumentDetailMeta {
  id: string;
  type: string;
  categorie: string;
  periode: string | null;
  libelle: string;
  statut_classement: string;
  date_document: string | null;
  date_reception: string;
  reference_externe: string | null;
  fichier_physique_id: string;
  client_id: string;
  client_raison_sociale: string;
  document_attendu_id: string | null;
  facture_id: string | null;
}

/** Extraction de la proposition de facture liée (provenance par champ incluse). */
export interface DocumentDetailExtractionFacture {
  proposition_id: string;
  statut: string;
  fournisseur_nom: string | null;
  numero_facture: string | null;
  date_emission: string | null;
  date_echeance: string | null;
  total_ht: string | null;
  total_tva: string | null;
  total_ttc: string | null;
  montant_a_payer: string | null;
  taux_tva_principal: string | null;
  devise: string;
  qr_facture_detecte: boolean;
  confiance_globale: number | null;
  /** Forme brute jsonb (normalisée côté UI via normaliserConfianceParChamp). */
  confiance_par_champ: unknown;
  anomalies: string[];
}

/** Facture finale (facture.facture) quand le document a été validé en facture. */
export interface DocumentDetailFactureFinale {
  id: string;
  fournisseur_nom: string;
  numero_facture: string;
  date_emission: string;
  total_ttc: string;
  montant_a_payer: string;
  devise: string;
  statut: string;
}

/** Échéance couverte par ce document (best-effort, via document_attendu). */
export interface DocumentDetailEcheanceCouverte {
  id: string;
  libelle: string;
  type: string;
  date_echeance: string;
  statut: string;
}

export interface DocumentDetail {
  document: DocumentDetailMeta;
  /** Présent si le document est une facture (extraction disponible). */
  extraction_facture: DocumentDetailExtractionFacture | null;
  /** Présent si la facture a été validée (entité finale). */
  facture_finale: DocumentDetailFactureFinale | null;
  /** Présent si une échéance est couverte par ce document (best-effort). */
  echeance_couverte: DocumentDetailEcheanceCouverte | null;
}

/** Vrai si le slug de type dénote une facture (`facture`, `facture_standard`, …). */
function estTypeFacture(type: string): boolean {
  return type.toLowerCase().startsWith("facture");
}

/**
 * Lit la raison sociale d'un `fournisseur_propose_data` jsonb sans jamais exposer
 * un champ sensible : on ne récupère QUE la raison sociale (string), rien d'autre.
 */
function raisonSocialeProposee(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const v = (raw as { raison_sociale?: unknown }).raison_sociale;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Charge le détail d'un document, scopé STRICTEMENT (cabinet_id, document_id).
 *
 * Retourne `null` si le document n'existe pas OU n'appartient pas au cabinet —
 * la page appelante doit alors rendre `notFound()` (404 indistinct).
 *
 * Si le document est une facture (type `facture*`, OU `facture_id` posé, OU une
 * `proposition_facture` existe), l'extraction (proposition) et, si validée, la
 * facture finale sont jointes. Aucun IBAN n'est jamais projeté.
 */
export async function getDocumentDetail(
  cabinet_id: string,
  document_id: string,
): Promise<DocumentDetail | null> {
  // 1) Porte de sécurité : document scopé (cabinet_id, document_id) + nom client.
  const docRows = await db
    .select({
      id: document.id,
      type: document.type,
      categorie: document.categorie,
      periode: document.periode,
      libelle: document.libelle,
      statut_classement: document.statut_classement,
      date_document: document.date_document,
      date_reception: document.date_reception,
      reference_externe: document.reference_externe,
      fichier_physique_id: document.fichier_physique_id,
      client_id: document.client_id,
      client_raison_sociale: client.raison_sociale,
      document_attendu_id: document.document_attendu_id,
      facture_id: document.facture_id,
    })
    .from(document)
    .innerJoin(client, eq(client.id, document.client_id))
    .where(and(eq(document.id, document_id), eq(document.cabinet_id, cabinet_id)))
    .limit(1);

  const d = docRows[0];
  if (!d) return null;

  const meta: DocumentDetailMeta = {
    id: d.id,
    type: d.type,
    categorie: d.categorie,
    periode: d.periode ?? null,
    libelle: d.libelle,
    statut_classement: d.statut_classement,
    date_document: d.date_document != null ? String(d.date_document) : null,
    date_reception: String(d.date_reception),
    reference_externe: d.reference_externe ?? null,
    fichier_physique_id: d.fichier_physique_id,
    client_id: d.client_id,
    client_raison_sociale: d.client_raison_sociale,
    document_attendu_id: d.document_attendu_id ?? null,
    facture_id: d.facture_id ?? null,
  };

  // 2) Extraction facture : proposition liée (document_id = document.id), scopée cabinet.
  //    On charge la proposition pour TOUT document (peu coûteux, 1 ligne unique) afin de
  //    détecter une facture même quand le slug de type ne commence pas par « facture ».
  const propRows = await db
    .select({
      proposition_id: propositionFacture.id,
      statut: propositionFacture.statut,
      fournisseur_existant_nom: fournisseur.raison_sociale,
      fournisseur_propose_data: propositionFacture.fournisseur_propose_data,
      numero_facture: propositionFacture.numero_facture_propose,
      date_emission: propositionFacture.date_emission_proposee,
      date_echeance: propositionFacture.date_echeance_proposee,
      total_ht: propositionFacture.total_ht_propose,
      total_tva: propositionFacture.total_tva_propose,
      total_ttc: propositionFacture.total_ttc_propose,
      montant_a_payer: propositionFacture.montant_a_payer_propose,
      taux_tva_principal: propositionFacture.taux_tva_principal_propose,
      devise: propositionFacture.devise_proposee,
      qr_facture_detecte: propositionFacture.qr_facture_detecte,
      confiance_globale: propositionFacture.confiance_globale,
      confiance_par_champ: propositionFacture.confiance_par_champ,
      anomalies: propositionFacture.anomalies_detectees,
    })
    .from(propositionFacture)
    .leftJoin(fournisseur, eq(fournisseur.id, propositionFacture.fournisseur_existant_id))
    .where(
      and(
        eq(propositionFacture.cabinet_id, cabinet_id),
        eq(propositionFacture.document_id, document_id),
      ),
    )
    .limit(1);

  const p = propRows[0];

  // Le document est-il une facture ? type `facture*`, OU facture_id posé, OU proposition présente.
  const estFacture = estTypeFacture(meta.type) || meta.facture_id != null || p != null;

  let extraction_facture: DocumentDetailExtractionFacture | null = null;
  if (estFacture && p) {
    extraction_facture = {
      proposition_id: p.proposition_id,
      statut: p.statut,
      fournisseur_nom:
        p.fournisseur_existant_nom ?? raisonSocialeProposee(p.fournisseur_propose_data),
      numero_facture: p.numero_facture ?? null,
      date_emission: p.date_emission != null ? String(p.date_emission) : null,
      date_echeance: p.date_echeance != null ? String(p.date_echeance) : null,
      total_ht: p.total_ht ?? null,
      total_tva: p.total_tva ?? null,
      total_ttc: p.total_ttc ?? null,
      montant_a_payer: p.montant_a_payer ?? null,
      taux_tva_principal: p.taux_tva_principal ?? null,
      devise: p.devise,
      qr_facture_detecte: p.qr_facture_detecte,
      confiance_globale: p.confiance_globale != null ? Number(p.confiance_globale) : null,
      confiance_par_champ: p.confiance_par_champ ?? null,
      anomalies: p.anomalies ?? [],
    };
  }

  // 3) Facture finale (facture.facture via document.facture_id), scopée cabinet. AUCUN IBAN.
  let facture_finale: DocumentDetailFactureFinale | null = null;
  if (meta.facture_id) {
    const factRows = await db
      .select({
        id: facture.id,
        fournisseur_nom: fournisseur.raison_sociale,
        numero_facture: facture.numero_facture,
        date_emission: facture.date_emission,
        total_ttc: facture.total_ttc,
        montant_a_payer: facture.montant_a_payer,
        devise: facture.devise,
        statut: facture.statut,
      })
      .from(facture)
      .innerJoin(fournisseur, eq(fournisseur.id, facture.fournisseur_id))
      .where(and(eq(facture.cabinet_id, cabinet_id), eq(facture.id, meta.facture_id)))
      .limit(1);
    const f = factRows[0];
    if (f) {
      facture_finale = {
        id: f.id,
        fournisseur_nom: f.fournisseur_nom,
        numero_facture: f.numero_facture,
        date_emission: String(f.date_emission),
        total_ttc: f.total_ttc,
        montant_a_payer: f.montant_a_payer,
        devise: f.devise,
        statut: f.statut,
      };
    }
  }

  // 4) Échéance couverte (best-effort) : une échéance du client dont documents_requis
  //    contient le document_attendu_id de ce document. Lien « à confirmer » (l'intégrité
  //    documents_requis est applicative, c'est un uuid[] sans FK). Scopé cabinet + client.
  let echeance_couverte: DocumentDetailEcheanceCouverte | null = null;
  if (meta.document_attendu_id) {
    const echRows = await db
      .select({
        id: echeance.id,
        libelle: echeance.libelle,
        type: echeance.type,
        date_echeance: echeance.date_echeance,
        statut: echeance.statut,
      })
      .from(echeance)
      .where(
        and(
          eq(echeance.cabinet_id, cabinet_id),
          eq(echeance.client_id, meta.client_id),
          // documents_requis (uuid[]) contient le document_attendu_id de ce document.
          sql`${echeance.documents_requis} @> ARRAY[${meta.document_attendu_id}]::uuid[]`,
        ),
      )
      .orderBy(desc(echeance.date_echeance))
      .limit(1);
    const e = echRows[0];
    if (e) {
      echeance_couverte = {
        id: e.id,
        libelle: e.libelle,
        type: e.type,
        date_echeance: String(e.date_echeance),
        statut: e.statut,
      };
    }
  }

  return { document: meta, extraction_facture, facture_finale, echeance_couverte };
}
