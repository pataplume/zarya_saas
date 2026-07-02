import { getCurrentUser } from "@zarya/auth";
import { client, db, document, facture, fichierPhysique, propositionFacture } from "@zarya/db";
import { and, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { helpAttrs } from "@/lib/help-attrs";
import { normaliserConfianceParChamp } from "./confiance-provenance";
import { type FactureItem, FacturesValidation } from "./factures-client";

// File des factures à valider — module Facture (facture.md §6, Bloc E5b).
// Lit facture.proposition_facture (statut a_valider) scopée cabinet_id (frontière de
// sécurité réelle sur le chemin service-role — ADR 0005 addendum), jointe au client.
// IBAN (ADR 0013) : l'IBAN de l'IA reste stripé (le validateur le saisit). L'IBAN-DU-QR, lui,
// est au Vault dès la proposition (C6.1) : on n'envoie au client QUE le masque d'affichage +
// un booléen `a_iban_qr` (jamais le vault_id ni le clair).

function n(v: string | null): number | null {
  return v === null ? null : Number(v);
}

// Pagination serveur (?page=) : taille de page de la file de validation.
const PAR_PAGE = 25;

export default async function FacturesValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutValider = role !== "lecteur";

  // Factures validées prêtes à exporter vers la comptabilité (statut 'validee').
  const [exportables] = await db
    .select({ n: count() })
    .from(facture)
    .where(and(eq(facture.cabinet_id, cabinet_id), eq(facture.statut, "validee")));
  const nbExportables = exportables?.n ?? 0;

  // Total des propositions à valider (pour le compteur + le nombre de pages).
  const [enAttente] = await db
    .select({ n: count() })
    .from(propositionFacture)
    .where(
      and(
        eq(propositionFacture.cabinet_id, cabinet_id),
        eq(propositionFacture.statut, "a_valider"),
      ),
    );
  const total = enAttente?.n ?? 0;

  const sp = await searchParams;
  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const pageDemandee = Number.parseInt(sp.page ?? "1", 10);
  const page = Math.min(Math.max(1, Number.isFinite(pageDemandee) ? pageDemandee : 1), nbPages);

  const rows = await db
    .select({
      id: propositionFacture.id,
      client_id: propositionFacture.client_id,
      client_nom: client.raison_sociale,
      fournisseur_propose_data: propositionFacture.fournisseur_propose_data,
      numero_facture_propose: propositionFacture.numero_facture_propose,
      date_emission_proposee: propositionFacture.date_emission_proposee,
      date_echeance_proposee: propositionFacture.date_echeance_proposee,
      total_ht_propose: propositionFacture.total_ht_propose,
      total_tva_propose: propositionFacture.total_tva_propose,
      total_ttc_propose: propositionFacture.total_ttc_propose,
      montant_a_payer_propose: propositionFacture.montant_a_payer_propose,
      taux_tva_principal_propose: propositionFacture.taux_tva_principal_propose,
      devise_proposee: propositionFacture.devise_proposee,
      categorie_proposee: propositionFacture.categorie_proposee,
      qr_facture_detecte: propositionFacture.qr_facture_detecte,
      // IBAN-du-QR (C6.1) : on lit le masque + l'existence du secret Vault (PAS le vault_id lui-même).
      iban_paiement_masque: propositionFacture.iban_paiement_masque,
      iban_paiement_vault_id: propositionFacture.iban_paiement_vault_id,
      anomalies_detectees: propositionFacture.anomalies_detectees,
      confiance_globale: propositionFacture.confiance_globale,
      confiance_par_champ: propositionFacture.confiance_par_champ,
      // Aperçu du document (split-screen) : identifiant du fichier physique servi par
      // /api/documents/[fichierId]/apercu (qui re-vérifie session + cabinet) + type MIME.
      // Aucune donnée sensible supplémentaire (pas d'IBAN, pas de chemin storage).
      fichier_id: document.fichier_physique_id,
      type_mime: fichierPhysique.type_mime,
    })
    .from(propositionFacture)
    .leftJoin(client, eq(propositionFacture.client_id, client.id))
    .leftJoin(document, eq(propositionFacture.document_id, document.id))
    .leftJoin(fichierPhysique, eq(document.fichier_physique_id, fichierPhysique.id))
    .where(
      and(
        eq(propositionFacture.cabinet_id, cabinet_id),
        eq(propositionFacture.statut, "a_valider"),
      ),
    )
    .orderBy(desc(propositionFacture.created_at))
    .limit(PAR_PAGE)
    .offset((page - 1) * PAR_PAGE);

  const factures: FactureItem[] = rows.map((r) => {
    const f = (r.fournisseur_propose_data ?? {}) as Record<string, string | null>;
    return {
      id: r.id,
      client_id: r.client_id,
      client_nom: r.client_nom ?? "—",
      fournisseur_raison_sociale: f.raison_sociale ?? "",
      fournisseur_ide: f.ide ?? "",
      fournisseur_numero_tva: f.numero_tva ?? "",
      fournisseur_bic: f.bic ?? "",
      numero_facture: r.numero_facture_propose ?? "",
      date_emission: r.date_emission_proposee ?? "",
      date_echeance: r.date_echeance_proposee ?? "",
      total_ht: n(r.total_ht_propose),
      total_tva: n(r.total_tva_propose),
      total_ttc: n(r.total_ttc_propose),
      montant_a_payer: n(r.montant_a_payer_propose),
      taux_tva_principal: n(r.taux_tva_principal_propose),
      devise: r.devise_proposee ?? "CHF",
      categorie: r.categorie_proposee ?? "",
      qr_facture_detecte: r.qr_facture_detecte,
      // IBAN-du-QR au Vault (C6.1) : on n'expose JAMAIS le vault_id ni le clair au client, seulement
      // le masque + un booléen dérivé côté serveur.
      a_iban_qr: r.iban_paiement_vault_id !== null,
      iban_paiement_masque: r.iban_paiement_masque ?? "",
      anomalies: r.anomalies_detectees ?? [],
      confiance_globale: n(r.confiance_globale),
      confiance_par_champ: normaliserConfianceParChamp(r.confiance_par_champ),
      fichier_id: r.fichier_id,
      type_mime: r.type_mime,
    };
  });

  return (
    // lg:max-w-7xl : donne au split-screen aperçu/formulaire la largeur nécessaire (lg+).
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:max-w-7xl lg:px-8">
      <PageHeader
        title="Factures à valider"
        description={`${total} facture${total > 1 ? "s" : ""} en attente`}
      />

      {/* Export comptable des factures validées (route /api/factures/export). */}
      {peutValider && nbExportables > 0 && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-medium text-emerald-800">
            {nbExportables} facture{nbExportables > 1 ? "s" : ""} validée
            {nbExportables > 1 ? "s" : ""} prête{nbExportables > 1 ? "s" : ""} à exporter
          </span>
          <Button asChild size="sm">
            <a
              href="/api/factures/export"
              {...helpAttrs(
                "Exporter (CSV)",
                "Télécharge un fichier CSV de toutes les factures validées, prêt à importer dans votre logiciel de comptabilité.",
              )}
            >
              Exporter (CSV)
            </a>
          </Button>
        </div>
      )}

      <FacturesValidation factures={factures} peutValider={peutValider} />

      <Pagination
        page={page}
        total={total}
        parPage={PAR_PAGE}
        hrefPour={(p) => `/app/factures/validation?page=${p}`}
      />
    </main>
  );
}
