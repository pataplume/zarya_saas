import { notFound } from "next/navigation";
import {
  DeclarerChangementForm,
  SaisieElementForm,
  ValiderPeriodeForm,
} from "@/components/salaire/periode-forms";
import { getEspaceClientContext } from "@/lib/espace-context";
import { getPeriodeDetailClient } from "@/lib/periode-client-data";

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

// G3a — Détail d'une période : matrice employés × éléments (pré-remplie M-1), saisie + validation.
export default async function PeriodeDetailPage({
  params,
}: {
  params: Promise<{ periodeId: string }>;
}) {
  const { periodeId } = await params;
  const { cabinet_id, client_id } = await getEspaceClientContext();
  const detail = await getPeriodeDetailClient(cabinet_id, client_id, periodeId);
  if (!detail) notFound();

  const { periode, employes, types, elements } = detail;
  const valeur = (employe_id: string, type_id: string) =>
    elements.find((e) => e.employe_id === employe_id && e.type_element_id === type_id)
      ?.valeur_numerique ?? "—";

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        Salaires {MOIS_FR[periode.mois - 1]} {periode.annee}
      </h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        À valider avant le {periode.date_limite_validation}.
        {periode.pre_remplie ? " Les valeurs reprises du mois précédent sont pré-remplies." : ""}
      </p>

      {employes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
          Aucun employé actif.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Employé</th>
                {types.map((t) => (
                  <th key={t.id} className="px-4 py-2 font-medium">
                    {t.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employes.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium text-foreground">
                    {e.prenom} {e.nom}
                  </td>
                  {types.map((t) => (
                    <td key={t.id} className="px-4 py-2 text-muted-foreground">
                      {valeur(e.id, t.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {periode.editable ? (
        <div className="mt-6 space-y-4">
          {employes.length > 0 && types.length > 0 ? (
            <SaisieElementForm periode_id={periode.id} employes={employes} types={types} />
          ) : null}
          <DeclarerChangementForm periode_id={periode.id} employes={employes} />
          {employes.length > 0 ? (
            <ValiderPeriodeForm periode_id={periode.id} />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Aucun employé enregistré pour cette période. Contactez votre fiduciaire pour ajouter
              vos employés.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
          Cette période est {periode.statut === "validee" ? "validée" : "clôturée"} : elle n'est
          plus modifiable.
        </div>
      )}
    </section>
  );
}
