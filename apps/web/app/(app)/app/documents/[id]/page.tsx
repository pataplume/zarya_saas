import { getCurrentUser } from "@zarya/auth";
import { AlertTriangle, QrCode } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { helpAttrs } from "@/lib/help-attrs";
import {
  badgeStatutClassement,
  libelleAnomalie,
  libelleCategorieDocument,
  libelleStatutEcheance,
  libelleStatutFacture,
  libelleStatutProposition,
  libelleTypeDocument,
  libelleTypeEcheance,
} from "@/lib/libelles";
import {
  type DocumentDetail,
  type DocumentDetailExtractionFacture,
  getDocumentDetail,
} from "../../../../../lib/document-detail-data";
import {
  type ConfianceParChampUi,
  normaliserConfianceParChamp,
} from "../../factures/validation/confiance-provenance";
import { ChampBadge } from "../../factures/validation/factures-client";

// C2.3 — Fiche document : en-tête (libellé, type traduit, client cliquable, statut) +
// bouton Ouvrir (aperçu) + bloc Extraction (provenance par champ QR✓/IA + anomalies pour
// une facture ; métadonnées de classement sinon) + liens transverses (Factures, échéance).
//
// Server Component. Scope STRICT (cabinet_id, document_id) via getDocumentDetail :
// null ⇒ notFound() (404 indistinct, anti-fuite cross-tenant). Aucun IBAN projeté.
// C4.1 — tous les libellés FR sont centralisés dans `@/lib/libelles`.

function typeLabel(type: string): string {
  return libelleTypeDocument(type);
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
  const statutClassement = badgeStatutClassement(doc.statut_classement);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <nav className="mb-4 text-[13px] text-muted-foreground">
        <Link href="/app/documents" className="hover:text-primary">
          Documents
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{doc.libelle}</span>
      </nav>

      <PageHeader
        title={doc.libelle}
        description={
          <>
            {typeLabel(doc.type)} · {libelleCategorieDocument(doc.categorie)}
            {doc.periode ? ` · ${doc.periode}` : ""}
            {" · "}
            <Link
              href={`/app/clients/${doc.client_id}`}
              className="font-medium text-primary hover:text-primary-hover"
            >
              {doc.client_raison_sociale}
            </Link>
          </>
        }
        actions={
          <>
            <Badge famille={statutClassement.famille}>{statutClassement.label}</Badge>
            <Button
              asChild
              size="sm"
              {...helpAttrs(
                "Ouvrir le document",
                "Ouvre le fichier d'origine dans un nouvel onglet pour le consulter.",
              )}
            >
              <a
                href={`/api/documents/${doc.fichier_physique_id}/apercu`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir le document
              </a>
            </Button>
          </>
        }
      />

      {/* Méta complémentaires */}
      <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <MetaItem label="Date du document" valeur={formatDate(doc.date_document)} />
        <MetaItem label="Reçu le" valeur={formatDate(doc.date_reception)} />
        {doc.reference_externe && <MetaItem label="Référence" valeur={doc.reference_externe} />}
      </dl>

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
      <section className="mt-8 flex flex-wrap gap-2">
        {(extraction_facture || facture_finale) && (
          <Button
            asChild
            variant="secondary"
            size="sm"
            {...helpAttrs(
              "Voir dans Factures",
              "Ouvre la file de validation des factures pour retrouver et traiter la facture issue de ce document.",
            )}
          >
            <Link href="/app/factures/validation">→ Voir dans Factures</Link>
          </Button>
        )}
        {echeance_couverte && (
          <Button
            asChild
            variant="secondary"
            size="sm"
            {...helpAttrs(
              "Échéance couverte",
              "Ce document répond à une échéance attendue du client. Cliquez pour ouvrir le calendrier des échéances.",
            )}
          >
            <Link
              href="/app/calendrier/echeances"
              title={`${echeance_couverte.libelle} · ${formatDate(echeance_couverte.date_echeance)}`}
            >
              → Échéance couverte : {libelleTypeEcheance(echeance_couverte.type)} (
              {libelleStatutEcheance(echeance_couverte.statut)})
            </Link>
          </Button>
        )}
        <Button
          asChild
          variant="secondary"
          size="sm"
          {...helpAttrs(
            "Ouvrir le dossier client",
            "Affiche la fiche du client rattaché à ce document : coordonnées, échéances et documents associés.",
          )}
        >
          <Link href={`/app/clients/${doc.client_id}`}>→ Dossier client</Link>
        </Button>
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
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Données extraites
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            ZARYA a lu ces champs sur la facture. La provenance est indiquée par champ : QR ✓ (sûr)
            ou IA (à confirmer).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extraction.qr_facture_detecte && (
            <Badge famille="succes">
              <QrCode className="size-3" aria-hidden />
              QR-facture détectée
            </Badge>
          )}
          <Badge famille="neutre">
            {factureValideeStatut
              ? libelleStatutFacture(factureValideeStatut)
              : libelleStatutProposition(extraction.statut)}
          </Badge>
          {extraction.confiance_globale != null && (
            <span className="text-xs text-muted-foreground">
              Confiance {Math.round(extraction.confiance_globale * 100)}%
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {champs.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-3 border-b border-border/70 pb-2"
          >
            <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span>{c.label}</span>
              <ChampBadge prov={prov(c.provKey)} />
            </dt>
            <dd className="text-[13px] font-medium text-foreground">{c.valeur}</dd>
          </div>
        ))}
      </dl>

      {/* Anomalies détectées (libellés lisibles, pas de slug brut) */}
      {extraction.anomalies.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Points d'attention
          </h3>
          <ul className="space-y-1">
            {extraction.anomalies.map((a) => {
              const fraude = a === "incoherence_qr_ia_iban";
              return (
                <li
                  key={a}
                  className={`flex items-start gap-1.5 text-sm ${fraude ? "font-semibold text-rose-700" : "text-amber-700"}`}
                >
                  {!fraude && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                  <span>{libelleAnomalie(a)}</span>
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
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Classement
      </h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Ce document n'est pas une facture : ZARYA a établi son classement documentaire.
      </p>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <ClassementItem label="Type" valeur={typeLabel(doc.type)} />
        <ClassementItem label="Catégorie" valeur={libelleCategorieDocument(doc.categorie)} />
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
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-medium text-foreground">{valeur}</dd>
    </div>
  );
}

function MetaItem({ label, valeur }: { label: string; valeur: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{valeur}</dd>
    </div>
  );
}
