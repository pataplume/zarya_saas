import { getCurrentUser } from "@zarya/auth";
import { db, demandeAcces } from "@zarya/db";
import { desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { changerStatutDemandeAccesAction } from "./actions";
import {
  LIBELLE_STATUT_DEMANDE_ACCES,
  STATUTS_DEMANDE_ACCES,
  type StatutDemandeAcces,
} from "./statuts";

// P0-7 (AUDIT-MVP §8) — mini back-office des demandes d'accès (crm.demande_acces,
// table hors multi-tenant : leads pré-cabinet, cf. migration 0045). Personne ne lisait
// ce que /demande-acces enregistrait. Réservé aux admins plateforme ZARYA
// (PLATFORM_ADMIN_EMAILS, vérifié CÔTÉ SERVEUR) ; notFound() pour tous les autres.
// Pas de lien dans la sidebar pour l'instant : accès par URL directe.

function badgeStatut(statut: string): string {
  switch (statut) {
    case "nouvelle":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "en_cours":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "traitee":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "rejetee":
      return "bg-slate-100 text-slate-500 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

function libelleStatut(statut: string): string {
  return LIBELLE_STATUT_DEMANDE_ACCES[statut as StatutDemandeAcces] ?? statut;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminDemandesPage() {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user?.email, process.env.PLATFORM_ADMIN_EMAILS)) {
    notFound();
  }

  // Nouvelles d'abord, puis par date (plus récentes en premier).
  const demandes = await db
    .select({
      id: demandeAcces.id,
      nom: demandeAcces.nom,
      email: demandeAcces.email,
      cabinet_nom: demandeAcces.cabinet_nom,
      message: demandeAcces.message,
      statut: demandeAcces.statut,
      created_at: demandeAcces.created_at,
    })
    .from(demandeAcces)
    .orderBy(
      sql`CASE WHEN ${demandeAcces.statut} = 'nouvelle' THEN 0 ELSE 1 END`,
      desc(demandeAcces.created_at),
    );

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold text-slate-900">Demandes d'accès</h1>
      <p className="mt-1 text-sm text-slate-500">
        Prospects ayant rempli le formulaire public /demande-acces. Back-office réservé à l'équipe
        ZARYA (accès par URL directe).
      </p>

      {demandes.length === 0 ? (
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Aucune demande d'accès pour le moment.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {demandes.map((demande) => (
            <li
              key={demande.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{demande.nom}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeStatut(demande.statut)}`}
                    >
                      {libelleStatut(demande.statut)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {demande.email}
                    {demande.cabinet_nom ? ` — ${demande.cabinet_nom}` : ""}
                  </p>
                  {demande.message && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">
                      {demande.message}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Reçue le {formatDate(demande.created_at)}
                  </p>
                </div>

                <form action={changerStatutDemandeAccesAction} className="flex items-center gap-2">
                  <input type="hidden" name="demandeId" value={demande.id} />
                  <label htmlFor={`statut-${demande.id}`} className="sr-only">
                    Statut de la demande
                  </label>
                  <select
                    id={`statut-${demande.id}`}
                    name="statut"
                    defaultValue={demande.statut}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                  >
                    {STATUTS_DEMANDE_ACCES.map((statut) => (
                      <option key={statut} value={statut}>
                        {LIBELLE_STATUT_DEMANDE_ACCES[statut]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="h-8 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Mettre à jour
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
