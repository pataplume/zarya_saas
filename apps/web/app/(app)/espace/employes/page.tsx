import { getEmployesClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";

// F8 — Mes employés (dashboard-client.md §7). Lecture seule via la vue filtrée
// salaire.v_dashboard_client_employe. AVS/IBAN : seul l'état « renseigné » est affiché
// (jamais la valeur en clair — arbitré founder, anti-clair ADR 0013).
export default async function EspaceEmployesPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const employes = await getEmployesClient(cabinet_id, client_id);

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Mes employés</h1>
      <p className="mt-1 text-sm text-gray-500">
        Référentiel tenu avec votre fiduciaire. Les coordonnées bancaires et le numéro AVS sont
        conservés de façon chiffrée et ne sont pas affichés ici.
      </p>

      {employes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
          Aucun employé enregistré pour le moment.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Fonction</th>
                <th className="px-4 py-2 font-medium">Taux</th>
                <th className="px-4 py-2 font-medium">AVS</th>
                <th className="px-4 py-2 font-medium">IBAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employes.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {e.prenom} {e.nom}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{e.fonction ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {e.taux_activite ? `${e.taux_activite}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {e.avs_renseigne ? "✓ renseigné" : "— manquant"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {e.iban_renseigne ? "✓ renseigné" : "— manquant"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
