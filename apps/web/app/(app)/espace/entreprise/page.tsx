import { getEntrepriseClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";

// F8 — Mon entreprise (dashboard-client.md §6). Fiche CRM consultable, lecture seule.
// Données via la vue filtrée crm.v_dashboard_client_entreprise (champs internes exclus).
export default async function EspaceEntreprisePage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const e = await getEntrepriseClient(cabinet_id, client_id);

  if (!e) {
    return <p className="text-muted-foreground">Fiche entreprise indisponible.</p>;
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
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Mon entreprise</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Informations enregistrées par votre fiduciaire. Pour les corriger, contactez-la.
      </p>
      <dl className="mt-6 divide-y divide-border rounded-lg border border-border bg-card shadow-card">
        {lignes.map((l) => (
          <div key={l.label} className="flex justify-between gap-4 px-5 py-3">
            <dt className="text-sm text-muted-foreground">{l.label}</dt>
            <dd className="text-sm font-medium text-foreground">{l.valeur}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
