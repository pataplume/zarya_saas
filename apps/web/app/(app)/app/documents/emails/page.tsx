import { getCurrentUser } from "@zarya/auth";
import { db, emailBrut } from "@zarya/db";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

// Emails reçus — visibilité fiduciaire sur les emails captés par la boîte Microsoft connectée
// (doc.email_brut). Lecture seule, scopé cabinet_id. Le traitement (pièces jointes → documents)
// est automatique (webhook + cron) ; cet écran sert au suivi/diagnostic.

const STATUT_LABEL: Record<string, string> = {
  recu: "En attente",
  traite: "Traité",
  ignore: "Sans pièce utile",
  erreur: "Erreur",
};

const STATUT_STYLE: Record<string, string> = {
  recu: "bg-blue-50 text-blue-700 ring-blue-600/20",
  traite: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ignore: "bg-slate-100 text-slate-600 ring-slate-500/20",
  erreur: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function EmailsRecusPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/onboarding");

  const emails = await db
    .select({
      id: emailBrut.id,
      subject: emailBrut.subject,
      from_address: emailBrut.from_address,
      received_at: emailBrut.received_at,
      has_attachments: emailBrut.has_attachments,
      statut: emailBrut.statut,
    })
    .from(emailBrut)
    .where(eq(emailBrut.cabinet_id, cabinet_id))
    .orderBy(desc(emailBrut.received_at))
    .limit(200);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Emails reçus</h1>
          <p className="mt-1 text-sm text-slate-500">
            Emails captés depuis votre boîte Microsoft connectée. Les pièces jointes sont classées
            automatiquement et apparaissent dans la file de validation.
          </p>
        </div>
        <Link
          href="/app/documents"
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Documents
        </Link>
      </div>

      {emails.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-sm font-medium text-slate-600">Aucun email reçu pour l'instant</p>
          <p className="mt-1 text-xs text-slate-400">
            Les emails entrants sur la boîte connectée apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Objet
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
                  Expéditeur
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 md:table-cell">
                  Pièces jointes
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 lg:table-cell">
                  Reçu le
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emails.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="max-w-xs px-4 py-3">
                    <p
                      className="truncate text-sm font-medium text-slate-800"
                      title={e.subject ?? ""}
                    >
                      {e.subject ?? "(sans objet)"}
                    </p>
                    <p className="text-xs text-slate-400 sm:hidden">{e.from_address ?? "—"}</p>
                  </td>
                  <td className="hidden max-w-xs px-4 py-3 text-sm text-slate-500 sm:table-cell">
                    <span className="block truncate" title={e.from_address ?? ""}>
                      {e.from_address ?? "—"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                    {e.has_attachments ? "Oui" : "Non"}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-slate-500 lg:table-cell">
                    {formatDate(e.received_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUT_STYLE[e.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"
                      }`}
                    >
                      {STATUT_LABEL[e.statut] ?? e.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
