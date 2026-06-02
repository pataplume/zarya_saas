import { getCurrentUser } from "@zarya/auth";
import { client, db, propositionFacture } from "@zarya/db";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { type FactureItem, FacturesValidation } from "./factures-client";

// File des factures à valider — module Facture (facture.md §6, Bloc E5b).
// Lit facture.proposition_facture (statut a_valider) scopée cabinet_id (frontière de
// sécurité réelle sur le chemin service-role — ADR 0005 addendum), jointe au client.
// L'IBAN n'est PAS proposé (stripé en E3b, ADR 0013) : le validateur le saisit.

function n(v: string | null): number | null {
  return v === null ? null : Number(v);
}

export default async function FacturesValidationPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutValider = role !== "lecteur";

  const rows = await db
    .select({
      id: propositionFacture.id,
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
      anomalies_detectees: propositionFacture.anomalies_detectees,
      confiance_globale: propositionFacture.confiance_globale,
    })
    .from(propositionFacture)
    .leftJoin(client, eq(propositionFacture.client_id, client.id))
    .where(
      and(
        eq(propositionFacture.cabinet_id, cabinet_id),
        eq(propositionFacture.statut, "a_valider"),
      ),
    )
    .orderBy(desc(propositionFacture.created_at))
    .limit(200);

  const factures: FactureItem[] = rows.map((r) => {
    const f = (r.fournisseur_propose_data ?? {}) as Record<string, string | null>;
    return {
      id: r.id,
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
      anomalies: r.anomalies_detectees ?? [],
      confiance_globale: n(r.confiance_globale),
    };
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Factures à valider</h1>
      <p className="mb-6 text-sm text-gray-500">
        {factures.length} facture{factures.length > 1 ? "s" : ""} en attente
      </p>
      <FacturesValidation factures={factures} peutValider={peutValider} />
    </main>
  );
}
