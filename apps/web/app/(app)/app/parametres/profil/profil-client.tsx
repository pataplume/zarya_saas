"use client";

import { useActionState } from "react";
import { helpAttrs } from "@/lib/help-attrs";
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
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Identité
        </h2>

        {/* Email + rôle (lecture seule) */}
        <div className="mb-6 flex items-center gap-4 rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {(prenom[0] ?? email[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[role] ?? role}</p>
          </div>
        </div>

        <form action={profilAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prenom" className="mb-1 block text-sm font-medium text-slate-700">
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
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="nom" className="mb-1 block text-sm font-medium text-slate-700">
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
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label htmlFor="telephone" className="mb-1 block text-sm font-medium text-slate-700">
              Téléphone <span className="text-slate-400">(optionnel)</span>
            </label>
            <input
              id="telephone"
              type="tel"
              name="telephone"
              defaultValue={telephone}
              maxLength={40}
              placeholder="+41 22 000 00 00"
              className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label
              htmlFor="signatureEmail"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Signature email <span className="text-slate-400">(optionnel)</span>
            </label>
            <textarea
              id="signatureEmail"
              name="signatureEmail"
              defaultValue={signatureEmail}
              rows={4}
              maxLength={2000}
              placeholder="Jane Dupont&#10;Fiduciaire Exemple SA&#10;+41 22 000 00 00"
              className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-slate-400">
              Apparaîtra au bas des emails (relances) envoyés depuis votre boîte.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isProfilPending}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
              {...helpAttrs(
                "Enregistrer le profil",
                "Sauvegarde votre prénom, nom, téléphone et signature email. La signature apparaît au bas des emails envoyés depuis votre boîte.",
              )}
            >
              {isProfilPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {profilState.success && <p className="text-sm text-green-600">Profil mis à jour ✓</p>}
            {profilState.error && <p className="text-sm text-red-600">{profilState.error}</p>}
          </div>
        </form>
      </div>

      {/* ── Sécurité ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sécurité
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Choisissez un mot de passe fort d&apos;au moins 8 caractères.
        </p>

        <form action={mdpAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="nouveau" className="mb-1 block text-sm font-medium text-slate-700">
                Nouveau mot de passe
              </label>
              <input
                id="nouveau"
                type="password"
                name="nouveau"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="confirmation"
                className="mb-1 block text-sm font-medium text-slate-700"
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
                className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isMdpPending}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
              {...helpAttrs(
                "Changer le mot de passe",
                "Définit un nouveau mot de passe (au moins 8 caractères). Saisissez-le deux fois à l'identique pour confirmer.",
              )}
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
