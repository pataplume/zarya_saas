import { getCurrentUser } from "@zarya/auth";
import { notFound, redirect } from "next/navigation";
import {
  ArchiveForm,
  ModificationForm,
  SortieForm,
} from "@/components/salaire/employe-lifecycle-actions";
import {
  getClientReferentielContexte,
  getReferentielEmployes,
} from "@/lib/salaire-referentiel-data";

// G7b — Référentiel employé d'un client (vue fiduciaire) : cycle de vie en cours d'année.
// Sortie / modification (salaire-taux) / archivage inline (server actions G7a). Anti-clair AVS/IBAN.
const LIBELLE_STATUT: Record<string, string> = {
  propose: "Proposé",
  actif: "Actif",
  sorti: "Sorti",
  archive: "Archivé",
};
const COULEUR_STATUT: Record<string, string> = {
  propose: "bg-gray-100 text-gray-700",
  actif: "bg-green-100 text-green-700",
  sorti: "bg-amber-100 text-amber-700",
  archive: "bg-gray-200 text-gray-500",
};

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
      <h1 className="text-2xl font-semibold">Référentiel employés — {contexte.raison_sociale}</h1>
      <p className="mt-1 text-sm text-gray-500">
        Cycle de vie en cours d'année : entrées, sorties, modifications de salaire ou de taux,
        archivage. Les coordonnées bancaires et le numéro AVS sont chiffrés et ne sont jamais
        affichés.
      </p>
      {!periodeId && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Aucune période ouverte pour ce client : lancez la campagne mensuelle pour pouvoir
          enregistrer sorties et modifications.
        </p>
      )}

      {employes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
          Aucun employé au référentiel.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {employes.map((e) => (
            <div key={e.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-gray-900">
                    {e.prenom} {e.nom}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">{e.fonction ?? "—"}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEUR_STATUT[e.statut] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {LIBELLE_STATUT[e.statut] ?? e.statut}
                </span>
              </div>

              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                <div>
                  <dt className="inline text-gray-400">Salaire base : </dt>
                  <dd className="inline">{e.salaire_base_mensuel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-400">Taux : </dt>
                  <dd className="inline">{e.taux_activite ? `${e.taux_activite}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-400">Entrée : </dt>
                  <dd className="inline">{e.date_entree ?? "—"}</dd>
                </div>
                {e.date_sortie && (
                  <div>
                    <dt className="inline text-gray-400">Sortie : </dt>
                    <dd className="inline">{e.date_sortie}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-gray-400">AVS : </dt>
                  <dd className="inline">{e.avs_renseigne ? "✓ renseigné" : "— manquant"}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-400">IBAN : </dt>
                  <dd className="inline">{e.iban_renseigne ? "✓ renseigné" : "— manquant"}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
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
