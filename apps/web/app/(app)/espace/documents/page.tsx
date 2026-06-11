import type { DocumentClient, StatutClientFamille } from "@/lib/dashboard-client-data";
import { getDocumentsClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";
import { UploadClient } from "./upload-client";

// F8 + B1 — Mes documents : dépôt (B1) + liste des transmis. La liste lit la trace de dépôt
// `doc.upload_brut`, donc le document apparaît dès l'envoi avec un statut traduit (pas de
// jargon, UX §8), puis bascule sur « Classé » une fois validé par le cabinet. dashboard-client.md §9.
const BADGE_STATUT: Record<StatutClientFamille, string> = {
  en_cours: "bg-amber-50 text-amber-800 ring-amber-200",
  classe: "bg-green-50 text-green-800 ring-green-200",
  doublon: "bg-gray-100 text-gray-600 ring-gray-200",
  echec: "bg-red-50 text-red-800 ring-red-200",
};

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
                <p className="truncate text-sm font-medium text-gray-900">{d.nom}</p>
                <p className="text-xs text-gray-500">{formatSousTitre(d)}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${BADGE_STATUT[d.statut_famille]}`}
              >
                {d.statut_label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Sous-titre : catégorie/période une fois classé, sinon la date de dépôt.
function formatSousTitre(d: DocumentClient): string {
  if (d.categorie) {
    return d.periode ? `${d.categorie} · ${d.periode}` : d.categorie;
  }
  return `Déposé le ${new Date(d.date_upload).toLocaleDateString("fr-CH")}`;
}
