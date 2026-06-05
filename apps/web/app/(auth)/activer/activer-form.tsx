"use client";

// Run C1 — formulaire « définir mon mot de passe » pour l'activation d'un compte invité.
import { useActionState } from "react";
import { type ActiverState, definirMotDePasseAction } from "./actions";

const INITIAL: ActiverState = {};

export function ActiverForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(definirMotDePasseAction, INITIAL);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Choisissez un mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">Au moins 12 caractères.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">
          Confirmez le mot de passe
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Activation…" : "Activer mon compte"}
      </button>
    </form>
  );
}
