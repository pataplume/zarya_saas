import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getEspaceClientContext } from "@/lib/espace-context";
import { listerPeriodesClient } from "@/lib/periode-client-data";

// G3a — Liste des périodes de paie du client (flow E §4 / salaire.md §7.3).
const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const LIBELLE_STATUT: Record<string, string> = {
  non_demandee: "À compléter",
  en_attente: "À compléter",
  relancee: "À compléter (relancée)",
  en_retard: "En retard",
  validee: "Validée",
  exportee: "Transmise",
  cloturee: "Clôturée",
  non_applicable: "Sans objet",
};

export default async function EspaceValidationsPage() {
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const periodes = await listerPeriodesClient(cabinet_id, client_id);

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Validations</h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Vérifiez et validez les éléments de salaire de chaque mois.
      </p>

      {periodes.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={ClipboardCheck}
          title="Aucune période à valider pour le moment"
          hint="Les périodes de salaire préparées par votre fiduciaire apparaîtront ici."
        />
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card shadow-card">
          {periodes.map((p) => (
            <li key={p.id}>
              <Link
                href={`/espace/validations/${p.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-foreground">
                  {MOIS_FR[p.mois - 1]} {p.annee}
                </span>
                <span className="text-xs text-muted-foreground">
                  {LIBELLE_STATUT[p.statut] ?? p.statut}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
