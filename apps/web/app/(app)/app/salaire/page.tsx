import { getCurrentUser } from "@zarya/auth";
import { Banknote } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { LancerCampagneForm } from "@/components/salaire/campagne-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { helpAttrs } from "@/lib/help-attrs";
import { libelleStatutPeriode } from "@/lib/libelles";
import { getKpisFiduciaire, getPeriodesFiduciaire } from "@/lib/salaire-fiduciaire-data";

// G4a — Dashboard Salaire fiduciaire (lecture) : KPIs du mois + tableau par client.
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

export default async function SalaireFiduciairePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id) redirect("/app");
  const role = (user?.app_metadata.role as string | undefined) ?? "lecteur";
  const peutExporter = role !== "lecteur";

  const sp = await searchParams;
  const now = new Date();
  const annee = sp.annee ? Number(sp.annee) : now.getUTCFullYear();
  const mois = sp.mois ? Number(sp.mois) : now.getUTCMonth() + 1;

  const [kpis, periodes] = await Promise.all([
    getKpisFiduciaire(cabinet_id, annee, mois),
    getPeriodesFiduciaire(cabinet_id, annee, mois),
  ]);

  const cartes = [
    { label: "Périodes", valeur: kpis.total },
    { label: "Validées", valeur: kpis.validees },
    { label: "À valider", valeur: kpis.a_valider },
    { label: "En retard", valeur: kpis.en_retard },
    { label: "Exportées", valeur: kpis.exportees },
  ];

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader
        title={`Salaires — ${MOIS_FR[mois - 1]} ${annee}`}
        description="Suivi du cycle mensuel de validation des salaires."
      />

      <div className="flex flex-wrap items-center gap-3">
        <LancerCampagneForm annee={annee} mois={mois} />
        <Link
          href="/app/salaire/relances"
          className="text-sm font-medium text-primary hover:text-primary-hover hover:underline"
          {...helpAttrs(
            "Relances à valider",
            "Ouvre la file des relances des périodes de salaire en retard. Chaque relance est vérifiée puis envoyée depuis la boîte du cabinet.",
          )}
        >
          Relances à valider →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cartes.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4 shadow-card">
            <p className="text-2xl font-semibold text-foreground">{c.valeur}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {periodes.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Aucune période pour ce mois"
            hint="Lancez la campagne pour générer les périodes de salaire des clients concernés."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Employés</TableHead>
                <TableHead>Changements</TableHead>
                <TableHead>Pièces</TableHead>
                <TableHead>Limite</TableHead>
                <TableHead className="text-right">Traitement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periodes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/app/clients/${p.client_id}`}
                      className="text-primary hover:text-primary-hover hover:underline"
                      {...helpAttrs(
                        "Ouvrir la fiche client",
                        "Ouvre le dossier complet du client (documents, échéances, factures, salaires). Vous y retrouvez toute l'activité de la PME.",
                      )}
                    >
                      {p.raison_sociale}
                    </Link>
                  </TableCell>
                  <TableCell>{libelleStatutPeriode(p.statut)}</TableCell>
                  <TableCell>{p.nb_employes_concernes}</TableCell>
                  <TableCell>{p.nb_changements_declares}</TableCell>
                  <TableCell>{p.nb_pieces}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.date_limite_validation}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/app/salaire/periode/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-secondary-foreground shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700"
                      {...helpAttrs(
                        peutExporter ? "Traiter la période" : "Ouvrir la période",
                        "Ouvre le détail de la période : matrice employés × éléments, revue fiduciaire, export Excel, puis clôture après import dans votre logiciel de paie.",
                      )}
                    >
                      {peutExporter ? "Traiter" : "Ouvrir"} →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
