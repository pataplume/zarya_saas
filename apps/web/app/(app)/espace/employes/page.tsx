import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Mes employés</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Référentiel tenu avec votre fiduciaire. Les coordonnées bancaires et le numéro AVS sont
        conservés de façon chiffrée et ne sont pas affichés ici.
      </p>

      {employes.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Users}
          title="Aucun employé enregistré pour le moment"
          hint="Votre fiduciaire ajoute les employés de votre entreprise ; ils apparaîtront ici."
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Fonction</th>
                <th className="px-4 py-2 font-medium">Taux</th>
                <th className="px-4 py-2 font-medium">AVS</th>
                <th className="px-4 py-2 font-medium">IBAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employes.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium text-foreground">
                    {e.prenom} {e.nom}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{e.fonction ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.taux_activite ? `${e.taux_activite}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.avs_renseigne ? "✓ renseigné" : "— manquant"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
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
