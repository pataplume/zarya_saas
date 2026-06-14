"use client";

// C5.2 — Édition du profil côté espace client : nom affiché, mot de passe, adresse e-mail.
// Trois formulaires indépendants (un état par action) pour des retours ciblés. Aucun mot de
// passe n'est conservé côté client au-delà de la soumission.
import { useActionState } from "react";
import {
  modifierEmailAction,
  modifierMotDePasseAction,
  modifierNomAfficheAction,
  type ProfilClientState,
} from "./actions";

const INITIAL: ProfilClientState = {};

function Feedback({ state }: { state: ProfilClientState }) {
  if (state.success) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
        {state.success}
      </p>
    );
  }
  if (state.error) {
    return <p className="text-sm text-red-600">{state.error}</p>;
  }
  return null;
}

export function ProfilForm({
  emailActuel,
  nomActuel,
}: {
  emailActuel: string | null;
  nomActuel: string;
}) {
  const [nomState, nomAction, nomPending] = useActionState(modifierNomAfficheAction, INITIAL);
  const [mdpState, mdpAction, mdpPending] = useActionState(modifierMotDePasseAction, INITIAL);
  const [emailState, emailAction, emailPending] = useActionState(modifierEmailAction, INITIAL);

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";
  const buttonClass =
    "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Nom affiché */}
      <form action={nomAction} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">Nom affiché</p>
        <div>
          <label htmlFor="display_name" className="block text-sm text-gray-600">
            Nom
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            defaultValue={nomActuel}
            className={inputClass}
          />
        </div>
        <Feedback state={nomState} />
        <button type="submit" disabled={nomPending} className={buttonClass}>
          {nomPending ? "Enregistrement…" : "Enregistrer le nom"}
        </button>
      </form>

      {/* Mot de passe */}
      <form action={mdpAction} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-900">Mot de passe</p>
        <div>
          <label htmlFor="nouveau" className="block text-sm text-gray-600">
            Nouveau mot de passe (8 caractères minimum)
          </label>
          <input
            id="nouveau"
            name="nouveau"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="confirmation" className="block text-sm text-gray-600">
            Confirmer le mot de passe
          </label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <Feedback state={mdpState} />
        <button type="submit" disabled={mdpPending} className={buttonClass}>
          {mdpPending ? "Modification…" : "Changer le mot de passe"}
        </button>
      </form>

      {/* Adresse e-mail */}
      <form
        action={emailAction}
        className="space-y-3 rounded-lg border border-gray-200 bg-white p-5"
      >
        <p className="text-sm font-medium text-gray-900">Adresse de connexion</p>
        <div>
          <label htmlFor="email" className="block text-sm text-gray-600">
            Nouvelle adresse e-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={emailActuel ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            Un e-mail de confirmation sera envoyé à la nouvelle adresse.
          </p>
        </div>
        <Feedback state={emailState} />
        <button type="submit" disabled={emailPending} className={buttonClass}>
          {emailPending ? "Envoi…" : "Changer l'adresse e-mail"}
        </button>
      </form>
    </div>
  );
}
