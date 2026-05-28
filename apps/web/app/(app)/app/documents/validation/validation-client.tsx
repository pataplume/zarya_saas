"use client";

import { useActionState, useState } from "react";
import {
  rejeterPropositionAction,
  type ValidationState,
  validerPropositionAction,
} from "./actions";

type ClientOption = { id: string; raison_sociale: string };

type Proposition = {
  id: string;
  type_propose: string | null;
  categorie_proposee: string | null;
  periode_proposee: string | null;
  libelle_propose: string | null;
  client_id_propose: string | null;
  confiance_globale: string | null;
  anomalies: string[];
  nom_fichier: string | null;
};

const CATEGORIES = [
  ["bancaire", "Bancaire"],
  ["fiscal", "Fiscal"],
  ["salaire", "Salaire"],
  ["commercial", "Commercial"],
  ["administratif", "Administratif"],
  ["autre", "Autre"],
] as const;

const initial: ValidationState = {};

function pourcent(confiance: string | null): number | null {
  if (!confiance) return null;
  const n = Number.parseFloat(confiance);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function PropositionCard({
  proposition,
  clients,
}: {
  proposition: Proposition;
  clients: ClientOption[];
}) {
  const [valState, valAction, valPending] = useActionState(validerPropositionAction, initial);
  const [rejState, rejAction, rejPending] = useActionState(rejeterPropositionAction, initial);
  const [showRejet, setShowRejet] = useState(false);

  const conf = pourcent(proposition.confiance_globale);
  const sansClient = clients.length === 0;
  const erreur = valState.error ?? rejState.error;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* En-tête : fichier + confiance + anomalies */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-slate-800"
            title={proposition.nom_fichier ?? undefined}
          >
            {proposition.nom_fichier ?? "Document sans nom"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {conf !== null && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  conf >= 60
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-amber-50 text-amber-700 ring-amber-600/20"
                }`}
              >
                Confiance {conf}%
              </span>
            )}
            {proposition.anomalies.map((a) => (
              <span
                key={a}
                className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Formulaire de validation */}
      <form action={valAction}>
        <input type="hidden" name="proposition_id" value={proposition.id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Client</span>
            <select
              name="client_id"
              defaultValue={proposition.client_id_propose ?? ""}
              required
              disabled={sansClient}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="" disabled>
                {sansClient ? "Aucun client disponible" : "Sélectionnez un client"}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.raison_sociale}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Catégorie</span>
            <select
              name="categorie"
              defaultValue={proposition.categorie_proposee ?? "autre"}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
            <input
              name="type"
              defaultValue={proposition.type_propose ?? ""}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Période</span>
            <input
              name="periode"
              defaultValue={proposition.periode_proposee ?? ""}
              placeholder="2026-04, 2026-Q1…"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-500">Libellé</span>
            <input
              name="libelle"
              defaultValue={proposition.libelle_propose ?? ""}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={valPending || rejPending || sansClient}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {valPending ? "Validation…" : "Valider"}
          </button>
          <button
            type="button"
            onClick={() => setShowRejet((v) => !v)}
            disabled={valPending || rejPending}
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Rejeter
          </button>
          {erreur && <span className="text-xs font-medium text-rose-600">{erreur}</span>}
        </div>
      </form>

      {/* Formulaire de rejet (motif optionnel) */}
      {showRejet && (
        <form action={rejAction} className="mt-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="proposition_id" value={proposition.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Motif du rejet (optionnel)
            </span>
            <input
              name="motif"
              maxLength={500}
              placeholder="Document illisible, hors périmètre…"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-rose-400 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={rejPending}
            className="mt-2 inline-flex items-center rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {rejPending ? "Rejet…" : "Confirmer le rejet"}
          </button>
        </form>
      )}
    </div>
  );
}
