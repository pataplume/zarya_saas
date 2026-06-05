"use client";

// Run D1 — formulaire public de demande d'accès. Sur succès : message de confirmation.
import Link from "next/link";
import { useActionState } from "react";
import { creerDemandeAccesAction, type DemandeState } from "./actions";

const INITIAL: DemandeState = {};

export function DemandeForm() {
  const [state, action, pending] = useActionState(creerDemandeAccesAction, INITIAL);

  if (state.success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
        <p className="font-medium">Merci, votre demande a bien été envoyée.</p>
        <p className="mt-1">Notre équipe vous recontactera rapidement.</p>
        <Link href="/" className="mt-3 inline-block text-xs font-medium text-green-700 underline">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field id="nom" name="nom" label="Votre nom" required />
      <Field id="email" name="email" label="Email professionnel" type="email" required />
      <Field id="cabinet_nom" name="cabinet_nom" label="Nom du cabinet (optionnel)" />
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">
          Message (optionnel)
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      {/* Honeypot anti-spam : caché des humains, rempli par les bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Envoyer ma demande"}
      </button>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
