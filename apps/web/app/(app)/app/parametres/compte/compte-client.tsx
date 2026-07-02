"use client";

// Run I1 — zone de danger : demande de suppression du compte cabinet (responsable).
import { useActionState } from "react";
import { demanderSuppressionCabinetAction, type SuppressionCabinetState } from "./actions";

const INITIAL: SuppressionCabinetState = {};

export function CompteClient({
  raisonSociale,
  statut,
  isResponsable,
}: {
  raisonSociale: string;
  statut: string;
  isResponsable: boolean;
}) {
  const [state, action, pending] = useActionState(demanderSuppressionCabinetAction, INITIAL);
  const dejaArchive = statut === "archive";

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">Compte du cabinet</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gestion de la clôture et de la suppression du compte (conformité nLPD/RGPD).
      </p>

      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
        <h2 className="font-medium text-red-800">Demander la suppression du compte</h2>
        <p className="mt-1 text-sm text-red-700">
          Cette demande enregistre votre souhait de suppression et clôture l'accès du cabinet.
          Conformément à nos obligations légales, certaines données sont conservées puis anonymisées
          (journaux d'audit 6 ans, données comptables 10 ans). Le traitement définitif est réalisé
          par notre délégué à la protection des données sous 30 jours.
        </p>

        {dejaArchive ? (
          <p className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-medium text-red-800">
            Une demande de suppression est en cours pour ce compte. Pour l'annuler, contactez le
            support.
          </p>
        ) : state.success ? (
          <p className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-medium text-green-700">
            Votre demande a bien été enregistrée. Le compte est désormais en cours de suppression ;
            notre équipe vous recontactera.
          </p>
        ) : (
          <form action={action} className="mt-4 space-y-3">
            <div>
              <label htmlFor="motif" className="block text-sm font-medium text-red-800">
                Motif (optionnel)
              </label>
              <textarea
                id="motif"
                name="motif"
                rows={2}
                disabled={!isResponsable}
                className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="confirmation" className="block text-sm font-medium text-red-800">
                Pour confirmer, saisissez le nom exact du cabinet :{" "}
                <span className="font-semibold">{raisonSociale}</span>
              </label>
              <input
                id="confirmation"
                name="confirmation"
                autoComplete="off"
                disabled={!isResponsable}
                className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>
            {state.error && <p className="text-sm text-red-700">{state.error}</p>}
            <button
              type="submit"
              disabled={!isResponsable || pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Enregistrement…" : "Demander la suppression"}
            </button>
            {!isResponsable && (
              <p className="text-xs text-red-600">
                Seul un responsable du cabinet peut effectuer cette demande.
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
