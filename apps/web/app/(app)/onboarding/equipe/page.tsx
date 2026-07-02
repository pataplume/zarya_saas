"use client";

import { useActionState, useState } from "react";
import { type InvitationsState, inviterMembresAction, passerEquipeAction } from "./actions";

let _membreIdCounter = 0;
type Membre = { id: number; email: string; prenom: string; nom: string; role: string };

const ROLES = [
  { value: "responsable", label: "Responsable" },
  { value: "gestionnaire_salaires", label: "Gestionnaire salaires" },
  { value: "collaborateur", label: "Collaborateur" },
  { value: "lecteur", label: "Lecteur" },
];

function ligneVide(): Membre {
  return { id: ++_membreIdCounter, email: "", prenom: "", nom: "", role: "collaborateur" };
}

export default function EquipePage() {
  const [membres, setMembres] = useState<Membre[]>([ligneVide()]);
  const [inviteState, inviterAction, isInviting] = useActionState<InvitationsState, FormData>(
    inviterMembresAction,
    {},
  );
  const [, passerAction, isPassing] = useActionState(passerEquipeAction, undefined);

  function ajouterMembre() {
    setMembres((prev) => [...prev, ligneVide()]);
  }

  function supprimerMembre(idx: number) {
    setMembres((prev) => prev.filter((_, i) => i !== idx));
  }

  function mettreAJour(idx: number, champ: keyof Membre, valeur: string) {
    setMembres((prev) => prev.map((m, i) => (i === idx ? { ...m, [champ]: valeur } : m)));
  }

  function erreurPourLigne(idx: number) {
    return inviteState.rowErrors?.find((e) => e.index === idx)?.message;
  }

  return (
    <div className="space-y-8">
      {/* En-tête étape */}
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Étape 2 / 3
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Votre équipe</h1>
        <p className="mt-1 text-sm text-slate-500">
          Invitez les membres de votre cabinet. Ils recevront un email pour créer leur compte.
        </p>
      </div>

      <form id="form-invitations" action={inviterAction} className="space-y-4">
        <div className="rounded-lg border border-border bg-card shadow-card">
          {/* En-tête tableau */}
          <div className="grid grid-cols-[1fr_1fr_1fr_140px_40px] gap-3 border-b border-slate-200 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prénom
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nom
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rôle
            </span>
            <span />
          </div>

          {/* Lignes membres */}
          {membres.map((membre, idx) => (
            <div
              key={membre.id}
              className="grid grid-cols-[1fr_1fr_1fr_140px_40px] gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
            >
              <div>
                <input
                  type="email"
                  name={`membre_${idx}_email`}
                  value={membre.email}
                  onChange={(e) => {
                    mettreAJour(idx, "email", e.target.value);
                  }}
                  placeholder="jane@cabinet.ch"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {erreurPourLigne(idx) && (
                  <p className="mt-0.5 text-xs text-red-600">{erreurPourLigne(idx)}</p>
                )}
              </div>
              <input
                type="text"
                name={`membre_${idx}_prenom`}
                value={membre.prenom}
                onChange={(e) => {
                  mettreAJour(idx, "prenom", e.target.value);
                }}
                placeholder="Jane"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                name={`membre_${idx}_nom`}
                value={membre.nom}
                onChange={(e) => {
                  mettreAJour(idx, "nom", e.target.value);
                }}
                placeholder="Dupont"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                name={`membre_${idx}_role`}
                value={membre.role}
                onChange={(e) => {
                  mettreAJour(idx, "role", e.target.value);
                }}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  supprimerMembre(idx);
                }}
                aria-label="Supprimer ce membre"
                className="flex items-center justify-center rounded text-slate-400 hover:text-red-500 focus:outline-none"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
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
            </div>
          ))}

          {/* Bouton ajouter */}
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={ajouterMembre}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 focus:outline-none"
            >
              + Ajouter un membre
            </button>
          </div>
        </div>

        {inviteState.error && <p className="text-sm text-red-600">{inviteState.error}</p>}
      </form>

      {/* Boutons hors du form invitations — évite l'imbrication HTML invalide */}
      <div className="flex items-center justify-between">
        <form action={passerAction}>
          <button
            type="submit"
            disabled={isPassing}
            className="text-sm text-slate-500 underline hover:text-slate-700 focus:outline-none disabled:opacity-50"
          >
            Je suis seul·e, continuer sans inviter
          </button>
        </form>

        <button
          type="submit"
          form="form-invitations"
          disabled={isInviting}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {isInviting ? "Envoi des invitations…" : "Envoyer les invitations →"}
        </button>
      </div>
    </div>
  );
}
