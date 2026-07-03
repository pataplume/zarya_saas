import { getCurrentUser } from "@zarya/auth";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ActionsPeriodeFiduciaire,
  SaisieFiduciaireForm,
} from "@/components/salaire/periode-fiduciaire-client";
import { Badge } from "@/components/ui/badge";
import { badgeStatutPeriode, libelleStatutPeriode } from "@/lib/libelles";
import { getPeriodeDetailFiduciaire } from "@/lib/periode-fiduciaire-data";

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

const ROLES_ECRITURE = new Set(["responsable", "gestionnaire_salaires", "collaborateur"]);

// RUN1 — Écran de détail d'une période côté FIDUCIAIRE : matrice employés × éléments,
// saisie/correction fiduciaire, puis le cycle Revue → Export → Import (clôture).
export default async function PeriodeFiduciairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const cabinet_id = user?.app_metadata.cabinet_id as string | undefined;
  if (!cabinet_id || !user) redirect("/onboarding");

  const role = (user.app_metadata.role as string | undefined) ?? "lecteur";
  const peutEcrire = ROLES_ECRITURE.has(role);

  const detail = await getPeriodeDetailFiduciaire(cabinet_id, id);
  if (!detail) notFound();

  const { periode, employes, types, elements, dernierExport } = detail;
  const valeur = (employeId: string, typeId: string) =>
    elements.find((e) => e.employe_id === employeId && e.type_element_id === typeId)
      ?.valeur_numerique ?? "—";
  const badge = badgeStatutPeriode(periode.statut);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Fil d'Ariane + en-tête */}
      <Link
        href="/app/salaire"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Salaires
      </Link>
      <div className="mt-2 mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Paie {MOIS_FR[periode.mois - 1]} {periode.annee}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {periode.raison_sociale}
            {periode.date_validation_recue
              ? " · validée par le client"
              : " · en attente de validation client"}
          </p>
        </div>
        <Badge famille={badge.famille}>{libelleStatutPeriode(periode.statut)}</Badge>
      </div>

      {/* Matrice employés × éléments (lecture) */}
      {employes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          Aucun employé actif pour ce client. Ajoutez des employés depuis le référentiel avant de
          traiter la paie.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Employé</th>
                {types.map((t) => (
                  <th key={t.id} className="px-4 py-2 font-semibold">
                    {t.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {employes.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-foreground">
                    {e.prenom} {e.nom}
                  </td>
                  {types.map((t) => (
                    <td key={t.id} className="px-4 py-2 tabular-nums text-muted-foreground">
                      {valeur(e.id, t.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Saisie / correction fiduciaire */}
      {peutEcrire && periode.editable && employes.length > 0 && types.length > 0 && (
        <div className="mt-4">
          <SaisieFiduciaireForm periodeId={periode.id} employes={employes} types={types} />
        </div>
      )}

      {/* Cycle Revue → Export → Clôture */}
      {peutEcrire && (
        <div className="mt-6">
          <ActionsPeriodeFiduciaire
            periodeId={periode.id}
            statut={periode.statut}
            revueFaite={periode.revue_fiduciaire_at != null}
            clientValide={periode.date_validation_recue != null}
            dernierExport={dernierExport}
          />
        </div>
      )}
    </div>
  );
}
