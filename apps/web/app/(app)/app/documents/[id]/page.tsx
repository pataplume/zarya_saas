import { getCurrentUser } from "@zarya/auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  type DocumentDetail,
  type DocumentDetailExtractionFacture,
  getDocumentDetail,
} from "../../../../../lib/document-detail-data";
import {
  ChampBadge,
  type ConfianceParChampUi,
  libelleAnomalie,
  normaliserConfianceParChamp,
} from "../../factures/validation/factures-client";

// C2.3 — Fiche document : en-tête (libellé, type traduit, client cliquable, statut) +
// bouton Ouvrir (aperçu) + bloc Extraction (provenance par champ QR✓/IA + anomalies pour
// une facture ; métadonnées de classement sinon) + liens transverses (Factures, échéance).
//
// Server Component. Scope STRICT (cabinet_id, document_id) via getDocumentDetail :
// null ⇒ notFound() (404 indistinct, anti-fuite cross-tenant). Aucun IBAN projeté.

// ─── Libellés FR (locaux — le module partagé arrive en C4.1) ────────────────────

const DOC_CATEGORIE_LABEL: Record<string, string> = {
  bancaire: "Bancaire",
  fiscal: "Fiscal",
  salaire: "Salaire",
  commercial: "Commercial",
  administratif: "Administratif",
  autre: "Autre",
};

// Slugs de type de document les plus courants (fallback = le slug brut, jamais vide).
const DOC_TYPE_LABEL: Record<string, string> = {
  facture: "Facture",
  facture_standard: "Facture",
  qr_facture: "QR-facture",
  avoir: "Avoir",
  acompte: "Acompte",
  releve_bancaire: "Relevé bancaire",
  declaration_tva: "Déclaration TVA",
  fiche_salaire: "Fiche de salaire",
  contrat: "Contrat",
  attestation: "Attestation",
  autre: "Autre",
};

const DOC_STATUT_CLASSEMENT: Record<string, { label: string; style: string }> = {
  auto: {
    label: "Classé automatiquement",
    style: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  valide_humain: { label: "Validé", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  corrige_humain: { label: "Corrigé", style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  manuel: { label: "Saisi manuellement", style: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

const DOC_STATUT_DEFAUT = {
  label: "Classé",
  style: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const PROPOSITION_STATUT_LABEL: Record<string, string> = {
  a_valider: "À valider",
  validee: "Validée",
  rejetee: "Rejetée",
};

const FACTURE_STATUT_LABEL: Record<string, string> = {
  en_attente_validation: "À valider",
  validee: "Validée",
  exportee: "Exportée",
  payee: "Payée",
  annulee: "Annulée",
};

const ECHEANCE_STATUT_LABEL: Record<string, string> = {
  a_venir: "À venir",
  imminente: "Imminente",
  en_retard: "En retard",
  reportee: "Reportée",
  traitee: "Traitée",
  annulee: "Annulée",
};

const ECHEANCE_TYPE_LABEL: Record<string, string> = {
  fiscale: "Fiscale",
  tva: "TVA",
  bouclement: "Bouclement",
  salaire: "Salaire",
  relance_documents: "Relance documents",
  personnalisee: "Personnalisée",
};

function typeLabel(type: string): string {
  return DOC_TYPE_LABEL[type] ?? type;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMontant(montant: string | null, devise: string): string {
  if (montant == null) return "—";
  const n = Number(montant);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise}`;
}

export default async function FicheDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  // Scope STRICT (cabinet_id, document_id) : null ⇒ 404 indistinct (anti-fuite cross-tenant).
  const detail = await getDocumentDetail(cabinet_id, id);
  if (!detail) notFound();

  const { document: doc, extraction_facture, facture_finale, echeance_couverte } = detail;
  const statutClassement = DOC_STATUT_CLASSEMENT[doc.statut_classement] ?? DOC_STATUT_DEFAUT;

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <nav className="mb-4 text-sm text-slate-500">
        <Link href="/app/documents" className="hover:text-blue-700">
          Documents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{doc.libelle}</span>
      </nav>

      {/* En-tête */}
      <header className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{doc.libelle}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {typeLabel(doc.type)} · {DOC_CATEGORIE_LABEL[doc.categorie] ?? doc.categorie}
              {doc.periode ? ` · ${doc.periode}` : ""}
              {" · "}
              <Link
                href={`/app/clients/${doc.client_id}`}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {doc.client_raison_sociale}
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statutClassement.style}`}
            >
              {statutClassement.label}
            </span>
            <a
              href={`/api/documents/${doc.fichier_physique_id}/apercu`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Ouvrir le document
            </a>
          </div>
        </div>

        {/* Méta complémentaires */}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <MetaItem label="Date du document" valeur={formatDate(doc.date_document)} />
          <MetaItem label="Reçu le" valeur={formatDate(doc.date_reception)} />
          {doc.reference_externe && <MetaItem label="Référence" valeur={doc.reference_externe} />}
        </dl>
      </header>

      {/* Bloc Extraction */}
      {extraction_facture ? (
        <ExtractionFactureSection
          extraction={extraction_facture}
          factureValideeStatut={facture_finale?.statut ?? null}
        />
      ) : (
        <ClassementSection doc={doc} />
      )}

      {/* Liens transverses */}
      <section className="mt-8 flex flex-wrap gap-3">
        {(extraction_facture || facture_finale) && (
          <Link
            href="/app/factures/validation"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            → Voir dans Factures
          </Link>
        )}
        {echeance_couverte && (
          <Link
            href="/app/calendrier/echeances"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title={`${echeance_couverte.libelle} · ${formatDate(echeance_couverte.date_echeance)}`}
          >
            → Échéance couverte :{" "}
            {ECHEANCE_TYPE_LABEL[echeance_couverte.type] ?? echeance_couverte.type} (
            {ECHEANCE_STATUT_LABEL[echeance_couverte.statut] ?? echeance_couverte.statut})
          </Link>
        )}
        <Link
          href={`/app/clients/${doc.client_id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          → Dossier client
        </Link>
      </section>
    </div>
  );
}

// ─── Bloc Extraction (facture) — provenance par champ + anomalies ────────────────

function ExtractionFactureSection({
  extraction,
  factureValideeStatut,
}: {
  extraction: DocumentDetailExtractionFacture;
  factureValideeStatut: string | null;
}) {
  const carte: ConfianceParChampUi = normaliserConfianceParChamp(extraction.confiance_par_champ);
  const prov = (champ: string) => carte[champ];

  // Champs extraits affichés avec leur badge de provenance (clé de provenance entre []).
  // Les totaux sont agrégés sous « montants », l'identité fournisseur sous « fournisseur ».
  const champs: { label: string; valeur: string; provKey: string }[] = [
    {
      label: "Fournisseur",
      valeur: extraction.fournisseur_nom ?? "—",
      provKey: "fournisseur",
    },
    { label: "N° de facture", valeur: extraction.numero_facture ?? "—", provKey: "numero_facture" },
    {
      label: "Date d'émission",
      valeur: formatDate(extraction.date_emission),
      provKey: "date_emission",
    },
    {
      label: "Date d'échéance",
      valeur: formatDate(extraction.date_echeance),
      provKey: "date_echeance",
    },
    {
      label: "Total HT",
      valeur: formatMontant(extraction.total_ht, extraction.devise),
      provKey: "montants",
    },
    {
      label: "Total TVA",
      valeur: formatMontant(extraction.total_tva, extraction.devise),
      provKey: "montants",
    },
    {
      label: "Total TTC",
      valeur: formatMontant(extraction.total_ttc, extraction.devise),
      provKey: "montants",
    },
    {
      label: "Montant à payer",
      valeur: formatMontant(extraction.montant_a_payer, extraction.devise),
      provKey: "montant_a_payer",
    },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Données extraites
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ZARYA a lu ces champs sur la facture. La provenance est indiquée par champ : QR ✓ (sûr)
            ou IA (à confirmer).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extraction.qr_facture_detecte && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              🔳 QR-facture détectée
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
            {factureValideeStatut
              ? (FACTURE_STATUT_LABEL[factureValideeStatut] ?? factureValideeStatut)
              : (PROPOSITION_STATUT_LABEL[extraction.statut] ?? extraction.statut)}
          </span>
          {extraction.confiance_globale != null && (
            <span className="text-xs text-slate-500">
              Confiance {Math.round(extraction.confiance_globale * 100)}%
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {champs.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"
          >
            <dt className="flex items-center gap-1.5 text-sm text-slate-500">
              <span>{c.label}</span>
              <ChampBadge prov={prov(c.provKey)} />
            </dt>
            <dd className="text-sm font-medium text-slate-800">{c.valeur}</dd>
          </div>
        ))}
      </dl>

      {/* Anomalies détectées (libellés lisibles, pas de slug brut) */}
      {extraction.anomalies.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Points d'attention
          </h3>
          <ul className="space-y-1">
            {extraction.anomalies.map((a) => {
              const fraude = a === "incoherence_qr_ia_iban";
              return (
                <li
                  key={a}
                  className={`text-sm ${fraude ? "font-semibold text-rose-700" : "text-amber-700"}`}
                >
                  {fraude ? "" : "⚠️ "}
                  {libelleAnomalie(a)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Bloc Classement (autre type de document) ────────────────────────────────────

function ClassementSection({ doc }: { doc: DocumentDetail["document"] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Classement
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Ce document n'est pas une facture : ZARYA a établi son classement documentaire.
      </p>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <ClassementItem label="Type" valeur={typeLabel(doc.type)} />
        <ClassementItem
          label="Catégorie"
          valeur={DOC_CATEGORIE_LABEL[doc.categorie] ?? doc.categorie}
        />
        <ClassementItem label="Période" valeur={doc.periode ?? "—"} />
        <ClassementItem label="Date du document" valeur={formatDate(doc.date_document)} />
        {doc.reference_externe && (
          <ClassementItem label="Référence" valeur={doc.reference_externe} />
        )}
      </dl>
    </section>
  );
}

function ClassementItem({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{valeur}</dd>
    </div>
  );
}

function MetaItem({ label, valeur }: { label: string; valeur: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{valeur}</dd>
    </div>
  );
}
