import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { DocumentClient, StatutClientFamille } from "@/lib/dashboard-client-data";
import { getDocumentsClient } from "@/lib/dashboard-client-data";
import { getEspaceClientContext } from "@/lib/espace-context";
import { UploadClient } from "./upload-client";

// F8 + B1 — Mes documents : dépôt (B1) + liste des transmis. La liste lit la trace de dépôt
// `doc.upload_brut`, donc le document apparaît dès l'envoi avec un statut traduit (pas de
// jargon, UX §8), puis bascule sur « Classé » une fois validé par le cabinet. dashboard-client.md §9.
const BADGE_STATUT: Record<StatutClientFamille, string> = {
  en_cours: "bg-amber-50 text-amber-700 ring-amber-600/20",
  classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  doublon: "bg-slate-100 text-slate-600 ring-slate-500/20",
  echec: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export default async function EspaceDocumentsPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const documents = await getDocumentsClient(cabinet_id, client_id);

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Mes documents</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Déposez vos documents pour votre fiduciaire ; ils sont classés automatiquement.
      </p>

      <UploadClient />

      <h2 className="mt-8 text-sm font-semibold tracking-tight text-foreground">
        Documents transmis
      </h2>

      {documents.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={FileText}
          title="Aucun document transmis pour le moment"
          hint="Les documents que vous déposez ci-dessus apparaîtront ici avec leur statut."
        />
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card shadow-card">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{d.nom}</p>
                <p className="text-xs text-muted-foreground">{formatSousTitre(d)}</p>
              </div>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset ${BADGE_STATUT[d.statut_famille]}`}
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
