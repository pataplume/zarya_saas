import { getCurrentUser } from "@zarya/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LancerCampagneForm } from "@/components/salaire/campagne-form";
import { libelleStatutPeriode } from "@/lib/libelles";
import { getKpisFiduciaire, getPeriodesFiduciaire } from "@/lib/salaire-fiduciaire-data";

// G4a — Dashboard Salaire fiduciaire (lecture) : KPIs du mois + tableau par client.
const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export default async function SalaireFiduciairePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/app");
  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutExporter = role !== "lecteur";

  const sp = await searchParams;
  const now = new Date();
  const annee = sp.annee ? Number(sp.annee) : now.getUTCFullYear();
  const mois = sp.mois ? Number(sp.mois) : now.getUTCMonth() + 1;

  const [kpis, periodes] = await Promise.all([
    getKpisFiduciaire(cabinet_id, annee, mois),
    getPeriodesFiduciaire(cabinet_id, annee, mois),
  ]);

  const cartes = [
    { label: "Périodes", valeur: kpis.total },
    { label: "Validées", valeur: kpis.validees },
    { label: "À valider", valeur: kpis.a_valider },
    { label: "En retard", valeur: kpis.en_retard },
    { label: "Exportées", valeur: kpis.exportees },
  ];

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">
        Salaires — {MOIS_FR[mois - 1]} {annee}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Suivi du cycle mensuel de validation des salaires.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LancerCampagneForm annee={annee} mois={mois} />
        <Link
          href="/app/salaire/relances"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Relances à valider →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cartes.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-2xl font-semibold text-gray-900">{c.valeur}</p>
            <p className="text-xs text-gray-500">{c.label}</p>
          </div>
        ))}
      </div>

      {periodes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
          Aucune période pour ce mois.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Employés</th>
                <th className="px-4 py-2 font-medium">Changements</th>
                <th className="px-4 py-2 font-medium">Pièces</th>
                <th className="px-4 py-2 font-medium">Limite</th>
                <th className="px-4 py-2 text-right font-medium">Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periodes.map((p) => {
                // Exportable dès que validée (ou déjà exportée → ré-export possible).
                const exportable = p.statut === "validee" || p.statut === "exportee";
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/app/clients/${p.client_id}`}
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {p.raison_sociale}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{libelleStatutPeriode(p.statut)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.nb_employes_concernes}</td>
                    <td className="px-4 py-2 text-gray-600">{p.nb_changements_declares}</td>
                    <td className="px-4 py-2 text-gray-600">{p.nb_pieces}</td>
                    <td className="px-4 py-2 text-gray-500">{p.date_limite_validation}</td>
                    <td className="px-4 py-2 text-right">
                      {peutExporter && exportable ? (
                        <a
                          href={`/app/salaire/export/${p.id}?format=xlsx`}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Exporter (Excel)
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
