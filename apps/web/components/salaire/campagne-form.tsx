"use client";

import { useActionState } from "react";
import { lancerCampagneAction, type SalaireFiduciaireState } from "@/app/(app)/app/salaire/actions";

const INITIAL: SalaireFiduciaireState = {};

// G4b — Bouton de lancement de la campagne mensuelle (génère les périodes du mois).
export function LancerCampagneForm({ annee, mois }: { annee: number; mois: number }) {
  const [state, action, pending] = useActionState(lancerCampagneAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="annee" value={annee} />
      <input type="hidden" name="mois" value={mois} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Lancer la campagne du mois
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      {state.success ? (
        <span className="text-sm text-green-600">{state.crees ?? 0} période(s) créée(s).</span>
      ) : null}
    </form>
  );
}
