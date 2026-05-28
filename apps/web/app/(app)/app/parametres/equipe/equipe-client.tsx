"use client";

import { useActionState } from "react";
import {
  annulerInvitationAction,
  changerRoleAction,
  type InviterState,
  inviterMembreAction,
  revoquerMembreAction,
} from "./actions";

// ─── Types (passés depuis le Server Component parent via props) ───────────────

type Membre = {
  id: string;
  user_id: string;
  role: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  created_at: Date;
  isSelf: boolean;
};

type Invitation = {
  id: string;
  email: string;
  prenom: string | null;
  nom: string | null;
  role_propose: string;
  date_envoi: Date;
  token_expire_at: Date;
};

type Props = {
  membres: Membre[];
  invitations: Invitation[];
  isResponsable: boolean;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  responsable: "Responsable",
  gestionnaire_salaires: "Gestionnaire salaires",
  collaborateur: "Collaborateur",
  lecteur: "Lecteur",
};

const ROLES = [
  { value: "responsable", label: "Responsable" },
  { value: "gestionnaire_salaires", label: "Gestionnaire salaires" },
  { value: "collaborateur", label: "Collaborateur" },
  { value: "lecteur", label: "Lecteur" },
];

// ─── Composant principal ──────────────────────────────────────────────────────

export function EquipeClient({ membres, invitations, isResponsable }: Props) {
  const [inviterState, inviterAction, isInviting] = useActionState<InviterState, FormData>(
    inviterMembreAction,
    {},
  );

  function nomAffiche(m: { prenom: string | null; nom: string | null; email: string | null }) {
    const nom = [m.prenom, m.nom].filter(Boolean).join(" ");
    return nom || m.email || "Membre";
  }

  return (
    <div className="space-y-8">
      {/* ── Section membres actifs ─────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Membres actifs · {membres.length}
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {membres.map((membre, idx) => (
            <div
              key={membre.id}
              className={`flex items-center gap-4 px-4 py-3 ${idx < membres.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              {/* Avatar initiales */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {(membre.prenom?.[0] ?? membre.email?.[0] ?? "?").toUpperCase()}
              </div>

              {/* Nom + email */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {nomAffiche(membre)}
                  {membre.isSelf && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                      moi
                    </span>
                  )}
                </p>
                {membre.email && <p className="truncate text-xs text-gray-400">{membre.email}</p>}
              </div>

              {/* Rôle — select si responsable, texte sinon */}
              <div className="shrink-0">
                {isResponsable && !membre.isSelf ? (
                  <form action={changerRoleAction}>
                    <input type="hidden" name="membre_id" value={membre.id} />
                    <select
                      name="role"
                      defaultValue={membre.role}
                      onChange={(e) => {
                        const form = e.currentTarget.form;
                        if (form) form.requestSubmit();
                      }}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </form>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    {ROLE_LABELS[membre.role] ?? membre.role}
                  </span>
                )}
              </div>

              {/* Révoquer */}
              {isResponsable && !membre.isSelf && (
                <form action={revoquerMembreAction}>
                  <input type="hidden" name="membre_id" value={membre.id} />
                  <button
                    type="submit"
                    className="shrink-0 rounded p-1 text-gray-300 hover:text-red-500 focus:outline-none"
                    aria-label={`Révoquer ${nomAffiche(membre)}`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Invitations en attente ─────────────────────────────────────────── */}
      {invitations.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Invitations en attente · {invitations.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm">
            {invitations.map((inv, idx) => (
              <div
                key={inv.id}
                className={`flex items-center gap-4 px-4 py-3 ${idx < invitations.length - 1 ? "border-b border-amber-100" : ""}`}
              >
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                  {inv.email[0]?.toUpperCase() ?? "?"}
                </div>

                {/* Email + nom */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{inv.email}</p>
                  <p className="truncate text-xs text-gray-500">
                    {[inv.prenom, inv.nom].filter(Boolean).join(" ")} ·{" "}
                    {ROLE_LABELS[inv.role_propose] ?? inv.role_propose}
                  </p>
                </div>

                {/* Expire */}
                <div className="shrink-0 text-right">
                  <p className="text-xs text-amber-700">En attente</p>
                  <p className="text-xs text-gray-400">
                    Expire le{" "}
                    {inv.token_expire_at.toLocaleDateString("fr-CH", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>

                {/* Annuler */}
                {isResponsable && (
                  <form action={annulerInvitationAction}>
                    <input type="hidden" name="invitation_id" value={inv.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded p-1 text-amber-400 hover:text-red-500 focus:outline-none"
                      aria-label={`Annuler l'invitation de ${inv.email}`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Formulaire d'invitation ────────────────────────────────────────── */}
      {isResponsable && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Inviter un membre
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <form action={inviterAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_160px]">
                <div>
                  <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-600">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    required
                    placeholder="jane@cabinet.ch"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="prenom" className="mb-1 block text-xs font-medium text-gray-600">
                    Prénom
                  </label>
                  <input
                    id="prenom"
                    type="text"
                    name="prenom"
                    required
                    placeholder="Jane"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="nom" className="mb-1 block text-xs font-medium text-gray-600">
                    Nom
                  </label>
                  <input
                    id="nom"
                    type="text"
                    name="nom"
                    required
                    placeholder="Dupont"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="role" className="mb-1 block text-xs font-medium text-gray-600">
                    Rôle
                  </label>
                  <select
                    id="role"
                    name="role"
                    defaultValue="collaborateur"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {inviterState.error && <p className="text-sm text-red-600">{inviterState.error}</p>}
              {inviterState.success && (
                <p className="text-sm text-green-600">Invitation envoyée avec succès ✓</p>
              )}

              <button
                type="submit"
                disabled={isInviting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isInviting ? "Envoi…" : "Envoyer l'invitation →"}
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
