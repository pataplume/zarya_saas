import Link from "next/link";
import { getEspaceClientContext } from "@/lib/espace-context";
import { listerPeriodesClient } from "@/lib/periode-client-data";

// G3a — Liste des périodes de paie du client (flow E §4 / salaire.md §7.3).
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
const LIBELLE_STATUT: Record<string, string> = {
  non_demandee: "À compléter",
  en_attente: "À compléter",
  relancee: "À compléter (relancée)",
  en_retard: "En retard",
  validee: "Validée",
  exportee: "Transmise",
  cloturee: "Clôturée",
  non_applicable: "Sans objet",
};

export default async function EspaceValidationsPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const periodes = await listerPeriodesClient(cabinet_id, client_id);

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Validations</h1>
      <p className="mt-1 text-sm text-gray-500">
        Vérifiez et validez les éléments de salaire de chaque mois.
      </p>

      {periodes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
          Aucune période à valider pour le moment.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {periodes.map((p) => (
            <li key={p.id}>
              <Link
                href={`/espace/validations/${p.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">
                  {MOIS_FR[p.mois - 1]} {p.annee}
                </span>
                <span className="text-xs text-gray-500">
                  {LIBELLE_STATUT[p.statut] ?? p.statut}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
