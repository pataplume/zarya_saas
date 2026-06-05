"use client";

import { useActionState } from "react";
import {
  changerMotDePasseAction,
  type MotDePasseState,
  mettreAJourProfilAction,
  type ProfilState,
} from "./actions";

type Props = {
  email: string;
  prenom: string;
  nom: string;
  role: string;
  telephone: string;
  signatureEmail: string;
};

const ROLE_LABELS: Record<string, string> = {
  responsable: "Responsable",
  gestionnaire_salaires: "Gestionnaire salaires",
  collaborateur: "Collaborateur",
  lecteur: "Lecteur",
};

export function ProfilClient({ email, prenom, nom, role, telephone, signatureEmail }: Props) {
  const [profilState, profilAction, isProfilPending] = useActionState<ProfilState, FormData>(
    mettreAJourProfilAction,
    {},
  );
  const [mdpState, mdpAction, isMdpPending] = useActionState<MotDePasseState, FormData>(
    changerMotDePasseAction,
    {},
  );

  return (
    <div className="space-y-8">
      {/* ── Identité ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Identité
        </h2>

        {/* Email + rôle (lecture seule) */}
        <div className="mb-6 flex items-center gap-4 rounded-lg bg-gray-50 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {(prenom[0] ?? email[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{email}</p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[role] ?? role}</p>
          </div>
        </div>

        <form action={profilAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prenom" className="mb-1 block text-sm font-medium text-gray-700">
                Prénom
              </label>
              <input
                id="prenom"
                type="text"
                name="prenom"
                defaultValue={prenom}
                required
                maxLength={100}
                placeholder="Jane"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="nom" className="mb-1 block text-sm font-medium text-gray-700">
                Nom
              </label>
              <input
                id="nom"
                type="text"
                name="nom"
                defaultValue={nom}
                required
                maxLength={100}
                placeholder="Dupont"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="telephone" className="mb-1 block text-sm font-medium text-gray-700">
              Téléphone <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              id="telephone"
              type="tel"
              name="telephone"
              defaultValue={telephone}
              maxLength={40}
              placeholder="+41 22 000 00 00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="signatureEmail"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Signature email <span className="text-gray-400">(optionnel)</span>
            </label>
            <textarea
              id="signatureEmail"
              name="signatureEmail"
              defaultValue={signatureEmail}
              rows={4}
              maxLength={2000}
              placeholder="Jane Dupont&#10;Fiduciaire Exemple SA&#10;+41 22 000 00 00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Apparaîtra au bas des emails (relances) envoyés depuis votre boîte.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isProfilPending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isProfilPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {profilState.success && <p className="text-sm text-green-600">Profil mis à jour ✓</p>}
            {profilState.error && <p className="text-sm text-red-600">{profilState.error}</p>}
          </div>
        </form>
      </div>

      {/* ── Sécurité ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Sécurité
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          Choisissez un mot de passe fort d&apos;au moins 8 caractères.
        </p>

        <form action={mdpAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nouveau" className="mb-1 block text-sm font-medium text-gray-700">
                Nouveau mot de passe
              </label>
              <input
                id="nouveau"
                type="password"
                name="nouveau"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="confirmation"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Confirmation
              </label>
              <input
                id="confirmation"
                type="password"
                name="confirmation"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isMdpPending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isMdpPending ? "Modification…" : "Changer le mot de passe"}
            </button>
            {mdpState.success && <p className="text-sm text-green-600">Mot de passe modifié ✓</p>}
            {mdpState.error && <p className="text-sm text-red-600">{mdpState.error}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}
