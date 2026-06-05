import { getDocumentsClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";
import { UploadClient } from "./upload-client";

// F8 + B1 — Mes documents : dépôt (B1) + liste des transmis (lecture seule via la vue filtrée
// doc.v_dashboard_client_document). dashboard-client.md §9.
export default async function EspaceDocumentsPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const documents = await getDocumentsClient(cabinet_id, client_id);

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Mes documents</h1>
      <p className="mt-1 text-sm text-gray-500">
        Déposez vos documents pour votre fiduciaire ; ils sont classés automatiquement.
      </p>

      <UploadClient />

      <h2 className="mt-8 text-base font-semibold text-gray-700">Documents transmis</h2>

      {documents.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500">
          Aucun document transmis pour le moment.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{d.libelle}</p>
                <p className="text-xs text-gray-500">
                  {d.categorie}
                  {d.periode ? ` · ${d.periode}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(d.created_at).toLocaleDateString("fr-CH")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
