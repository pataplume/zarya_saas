import { getCurrentUser } from "@zarya/auth";
import { client, db, demandeSuppression } from "@zarya/db";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { badgeStatutDemandeRgpd, styleFamille } from "@/lib/libelles";

// Demandes RGPD : visibilité côté cabinet des demandes de suppression émises par les
// clients (droit à l'effacement, droits-personnes.md). Scopé cabinet_id du JWT, cible='client'.
// C4.1 — libellés/statuts centralisés dans `@/lib/libelles`.

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function ConformitePage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const role = (user?.app_metadata.role as string | undefined) ?? "collaborateur";
  const isResponsable = role === "responsable";

  if (!isResponsable) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-900">Demandes RGPD</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demandes de suppression de données émises par vos clients.
        </p>
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Seul un responsable du cabinet peut consulter les demandes de suppression des clients.
        </p>
      </section>
    );
  }

  const demandes = await db
    .select({
      id: demandeSuppression.id,
      client_raison_sociale: client.raison_sociale,
      demandeur_email: demandeSuppression.demandeur_email,
      motif: demandeSuppression.motif,
      statut: demandeSuppression.statut,
      created_at: demandeSuppression.created_at,
    })
    .from(demandeSuppression)
    .leftJoin(client, eq(demandeSuppression.client_id, client.id))
    .where(
      and(eq(demandeSuppression.cabinet_id, cabinet_id), eq(demandeSuppression.cible, "client")),
    )
    .orderBy(desc(demandeSuppression.created_at));

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-900">Demandes RGPD</h1>
      <p className="mt-1 text-sm text-slate-500">
        Demandes de suppression de données émises par vos clients (droit à l'effacement). Le
        traitement définitif relève de votre responsabilité de fiduciaire.
      </p>

      {demandes.length === 0 ? (
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Aucune demande de suppression pour le moment.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Demandeur
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Motif
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {demandes.map((demande) => (
                <tr key={demande.id}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {demande.client_raison_sociale ?? "Client supprimé"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {demande.demandeur_email ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                    {formatDate(demande.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {demande.motif ? demande.motif : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styleFamille(
                        badgeStatutDemandeRgpd(demande.statut).famille,
                      )}`}
                    >
                      {badgeStatutDemandeRgpd(demande.statut).label}
                    </span>
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
