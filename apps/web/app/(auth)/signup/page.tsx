"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "./actions";

export default function SignupPage() {
  const [state, action, isPending] = useActionState(signupAction, {});

  if (state.success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            role="img"
            aria-label="Succès"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Vérifiez votre email</h2>
        <p className="mt-2 text-sm text-gray-500">
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-medium text-gray-900">{state.email}</span>.
        </p>
        <p className="mt-1 text-sm text-gray-500">Cliquez sur le lien pour activer votre compte.</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-gray-900 hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Créer un compte</h2>

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email professionnel
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            placeholder="sophie@cabinet-example.ch"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            placeholder="12 caractères minimum"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirmer le mot de passe
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            placeholder="••••••••••••"
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "Création du compte…" : "Créer mon compte"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-gray-900 hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
