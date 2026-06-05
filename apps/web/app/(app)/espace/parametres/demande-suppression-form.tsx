"use client";

// Run I1 — formulaire client : demande de suppression d'accès (routée vers le cabinet).
import { useActionState } from "react";
import { demanderSuppressionClientAction, type SuppressionClientState } from "./actions";

const INITIAL: SuppressionClientState = {};

export function DemandeSuppressionForm() {
  const [state, action, pending] = useActionState(demanderSuppressionClientAction, INITIAL);

  if (state.success) {
    return (
      <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
        Votre demande a été transmise à votre fiduciaire. Elle vous recontactera pour la suite.
      </p>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <label htmlFor="motif" className="block text-sm font-medium text-gray-700">
          Motif (optionnel)
        </label>
        <textarea
          id="motif"
          name="motif"
          rows={2}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Demander la suppression de mon accès"}
      </button>
    </form>
  );
}
