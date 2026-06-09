import { getCurrentUser } from "@zarya/auth";
import { db, propositionClassement, uploadBrut } from "@zarya/db";
import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DocumentsUploader } from "./documents-client";

// ─── Libellés & styles de statut ───────────────────────────────────────────────

const STATUT_LABEL: Record<string, string> = {
  recu: "Reçu",
  en_classification: "En classification",
  a_valider: "À valider",
  valide: "Validé",
  rejete: "Rejeté",
  doublon: "Doublon",
  erreur: "Erreur",
};

const STATUT_STYLE: Record<string, string> = {
  recu: "bg-blue-50 text-blue-700 ring-blue-600/20",
  en_classification: "bg-violet-50 text-violet-700 ring-violet-600/20",
  a_valider: "bg-amber-50 text-amber-700 ring-amber-600/20",
  valide: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rejete: "bg-rose-50 text-rose-700 ring-rose-600/20",
  doublon: "bg-slate-100 text-slate-600 ring-slate-500/20",
  erreur: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const SOURCE_LABEL: Record<string, string> = {
  email_microsoft: "Email",
  email_autre: "Email",
  nas: "NAS",
  upload_fiduciaire: "Upload",
  upload_client: "Client",
  api: "API",
  import_manuel: "Import",
};

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) {
    redirect("/onboarding");
  }

  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutUploader = role !== "lecteur";

  const [uploads, [aValider]] = await Promise.all([
    db
      .select({
        id: uploadBrut.id,
        nom: uploadBrut.nom_fichier_original,
        taille: uploadBrut.taille_octets,
        type_mime: uploadBrut.type_mime,
        source: uploadBrut.source,
        statut: uploadBrut.statut,
        date_upload: uploadBrut.date_upload,
      })
      .from(uploadBrut)
      .where(eq(uploadBrut.cabinet_id, cabinet_id))
      .orderBy(desc(uploadBrut.date_upload))
      .limit(100),
    db
      .select({ n: count() })
      .from(propositionClassement)
      .where(
        and(
          eq(propositionClassement.cabinet_id, cabinet_id),
          eq(propositionClassement.statut, "a_valider"),
        ),
      ),
  ]);

  const nbAValider = aValider?.n ?? 0;

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Déposez vos documents : ZARYA propose un classement que vous validez en un clic.
          </p>
        </div>
        <Link
          href="/app/documents/emails"
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Emails reçus →
        </Link>
      </div>

      {/* Action prioritaire : documents à valider (UX § 6) */}
      {peutUploader && nbAValider > 0 && (
        <Link
          href="/app/documents/validation"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm transition-colors hover:bg-amber-100"
        >
          <span className="font-medium text-amber-800">
            {nbAValider} document{nbAValider > 1 ? "s" : ""} à valider
          </span>
          <span className="font-medium text-amber-700">Valider →</span>
        </Link>
      )}

      {/* Zone d'upload */}
      {peutUploader ? (
        <DocumentsUploader />
      ) : (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Votre rôle (lecteur) ne permet pas d'ajouter des documents.
        </div>
      )}

      {/* Liste */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Documents reçus{uploads.length > 0 ? ` (${uploads.length})` : ""}
        </h2>

        {uploads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Aucun document pour l'instant</p>
            <p className="mt-1 text-xs text-slate-400">
              Déposez votre premier document pour démarrer.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    Fichier
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
                    Source
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 md:table-cell">
                    Taille
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
                {uploads.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate text-sm font-medium text-slate-800" title={u.nom}>
                        {u.nom}
                      </p>
                      <p className="text-xs text-slate-400 sm:hidden">
                        {SOURCE_LABEL[u.source] ?? u.source} · {formatTaille(u.taille)}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">
                      {SOURCE_LABEL[u.source] ?? u.source}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-slate-500 md:table-cell">
                      {formatTaille(u.taille)}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-slate-500 lg:table-cell">
                      {formatDate(u.date_upload)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          STATUT_STYLE[u.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"
                        }`}
                      >
                        {STATUT_LABEL[u.statut] ?? u.statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
