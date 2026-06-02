import { getEntrepriseClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";

// F8 — Mon entreprise (dashboard-client.md §6). Fiche CRM consultable, lecture seule.
// Données via la vue filtrée crm.v_dashboard_client_entreprise (champs internes exclus).
export default async function EspaceEntreprisePage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const e = await getEntrepriseClient(cabinet_id, client_id);

  if (!e) {
    return <p className="text-gray-600">Fiche entreprise indisponible.</p>;
  }

  const lignes: Array<{ label: string; valeur: string }> = [
    { label: "Raison sociale", valeur: e.raison_sociale },
    { label: "IDE", valeur: e.ide ?? "—" },
    { label: "Forme juridique", valeur: e.forme_juridique ?? "—" },
    { label: "Type", valeur: e.type },
    { label: "Statut", valeur: e.statut },
  ];

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Mon entreprise</h1>
      <p className="mt-1 text-sm text-gray-500">
        Informations enregistrées par votre fiduciaire. Pour les corriger, contactez-la.
      </p>
      <dl className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {lignes.map((l) => (
          <div key={l.label} className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-sm text-gray-500">{l.label}</dt>
            <dd className="text-sm font-medium text-gray-900">{l.valeur}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
