import { getCurrentUser } from "@zarya/auth";
import { Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  ArchiveForm,
  ModificationForm,
  SortieForm,
} from "@/components/salaire/employe-lifecycle-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { badgeStatutEmploye } from "@/lib/libelles";
import {
  getClientReferentielContexte,
  getReferentielEmployes,
} from "@/lib/salaire-referentiel-data";

// G7b — Référentiel employé d'un client (vue fiduciaire) : cycle de vie en cours d'année.
// Sortie / modification (salaire-taux) / archivage inline (server actions G7a). Anti-clair AVS/IBAN.
// C4.1 — libellés/statuts d'employé centralisés dans `@/lib/libelles`.

export default async function ReferentielEmployePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/app");

  const { clientId } = await params;
  const contexte = await getClientReferentielContexte(cabinet_id, clientId);
  if (!contexte) notFound();
  const employes = await getReferentielEmployes(cabinet_id, clientId);
  const periodeId = contexte.periode_courante_id;

  return (
    <section className="mx-auto max-w-5xl">
      <PageHeader
        title={`Référentiel employés — ${contexte.raison_sociale}`}
        description="Cycle de vie en cours d'année : entrées, sorties, modifications de salaire ou de taux, archivage. Les coordonnées bancaires et le numéro AVS sont chiffrés et ne sont jamais affichés."
      />
      {!periodeId && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Aucune période ouverte pour ce client : lancez la campagne mensuelle pour pouvoir
          enregistrer sorties et modifications.
        </p>
      )}

      {employes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="Aucun employé au référentiel"
            hint="Les employés déclarés par le client (ou importés) apparaîtront ici."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {employes.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-foreground">
                    {e.prenom} {e.nom}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">{e.fonction ?? "—"}</span>
                </div>
                <Badge famille={badgeStatutEmploye(e.statut).famille}>
                  {badgeStatutEmploye(e.statut).label}
                </Badge>
              </div>

              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <div>
                  <dt className="inline text-slate-400">Salaire base : </dt>
                  <dd className="inline">{e.salaire_base_mensuel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">Taux : </dt>
                  <dd className="inline">{e.taux_activite ? `${e.taux_activite}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">Entrée : </dt>
                  <dd className="inline">{e.date_entree ?? "—"}</dd>
                </div>
                {e.date_sortie && (
                  <div>
                    <dt className="inline text-slate-400">Sortie : </dt>
                    <dd className="inline">{e.date_sortie}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-slate-400">AVS : </dt>
                  <dd className="inline">{e.avs_renseigne ? "✓ renseigné" : "— manquant"}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">IBAN : </dt>
                  <dd className="inline">{e.iban_renseigne ? "✓ renseigné" : "— manquant"}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                {e.statut === "actif" && (
                  <>
                    <ModificationForm employeId={e.id} periodeId={periodeId} />
                    <SortieForm employeId={e.id} periodeId={periodeId} />
                  </>
                )}
                {e.statut === "sorti" && <ArchiveForm employeId={e.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
