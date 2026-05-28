"use client";

import { useActionState, useEffect, useState } from "react";
import {
  archiverClientAction,
  type ClientActionState,
  createClientAction,
  updateClientAction,
} from "./actions";

type Client = {
  id: string;
  raison_sociale: string;
  ide: string | null;
  email_contact: string | null;
  statut: string;
  archived_at: Date | null;
};

type Props = {
  clients: Client[];
  peutEcrire: boolean;
  isResponsable: boolean;
};

const STATUT_LABEL: Record<string, string> = {
  prospect: "Prospect",
  actif: "Actif",
  inactif: "Inactif",
  archive: "Archivé",
};

const STATUT_STYLE: Record<string, string> = {
  prospect: "bg-blue-50 text-blue-700 ring-blue-600/20",
  actif: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  inactif: "bg-slate-100 text-slate-600 ring-slate-500/20",
  archive: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const STATUTS = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
];

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ClientsClient({ clients, peutEcrire, isResponsable }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const actifs = clients.filter((c) => !c.archived_at);
  const archives = clients.filter((c) => c.archived_at);

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les PME que votre cabinet gère. Rattachez-y vos documents et échéances.
        </p>
      </div>

      {/* Liste des clients actifs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Clients · {actifs.length}
        </h2>

        {actifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Aucun client pour l'instant</p>
            <p className="mt-1 text-xs text-slate-400">
              {peutEcrire
                ? "Ajoutez votre premier client ci-dessous."
                : "Votre rôle ne permet pas d'ajouter des clients."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {actifs.map((c, idx) =>
              editingId === c.id ? (
                <EditRow
                  key={c.id}
                  client={c}
                  isLast={idx === actifs.length - 1}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <DisplayRow
                  key={c.id}
                  client={c}
                  isLast={idx === actifs.length - 1}
                  peutEcrire={peutEcrire}
                  isResponsable={isResponsable}
                  onEdit={() => setEditingId(c.id)}
                />
              ),
            )}
          </div>
        )}
      </section>

      {/* Formulaire de création */}
      {peutEcrire && <CreateForm />}

      {/* Clients archivés */}
      {archives.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Archivés · {archives.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
            {archives.map((c, idx) => (
              <div
                key={c.id}
                className={`flex items-center gap-4 px-4 py-3 ${idx < archives.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-500">{c.raison_sociale}</p>
                  {c.ide && <p className="truncate text-xs text-gray-400">{c.ide}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-400/20">
                  Archivé
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Ligne en lecture ─────────────────────────────────────────────────────────

function DisplayRow({
  client,
  isLast,
  peutEcrire,
  isResponsable,
  onEdit,
}: {
  client: Client;
  isLast: boolean;
  peutEcrire: boolean;
  isResponsable: boolean;
  onEdit: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 ${isLast ? "" : "border-b border-gray-100"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{client.raison_sociale}</p>
        <p className="truncate text-xs text-gray-400">
          {[client.ide, client.email_contact].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <span
        className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
          STATUT_STYLE[client.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"
        }`}
      >
        {STATUT_LABEL[client.statut] ?? client.statut}
      </span>

      {peutEcrire && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none"
        >
          Modifier
        </button>
      )}

      {isResponsable && (
        <form action={archiverClientAction} className="shrink-0">
          <input type="hidden" name="id" value={client.id} />
          <button
            type="submit"
            className="rounded p-1 text-gray-300 hover:text-red-500 focus:outline-none"
            aria-label={`Archiver ${client.raison_sociale}`}
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
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Ligne en édition ─────────────────────────────────────────────────────────

function EditRow({
  client,
  isLast,
  onDone,
}: {
  client: Client;
  isLast: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(
    updateClientAction,
    {},
  );

  useEffect(() => {
    if (state.success) onDone();
  }, [state.success, onDone]);

  return (
    <form
      action={action}
      className={`space-y-3 bg-blue-50/40 px-4 py-4 ${isLast ? "" : "border-b border-gray-100"}`}
    >
      <input type="hidden" name="id" value={client.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_140px]">
        <input
          name="raison_sociale"
          required
          defaultValue={client.raison_sociale}
          placeholder="Raison sociale"
          className={INPUT_CLASS}
        />
        <input
          name="ide"
          defaultValue={client.ide ?? ""}
          placeholder="CHE-123.456.789"
          className={INPUT_CLASS}
        />
        <input
          name="email_contact"
          type="email"
          defaultValue={client.email_contact ?? ""}
          placeholder="contact@client.ch"
          className={INPUT_CLASS}
        />
        <select name="statut" defaultValue={client.statut} className={INPUT_CLASS}>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ─── Formulaire de création ───────────────────────────────────────────────────

function CreateForm() {
  const [state, action, pending] = useActionState<ClientActionState, FormData>(
    createClientAction,
    {},
  );

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Ajouter un client
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <form action={action} className="space-y-4" key={state.success ? "reset" : "form"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_140px]">
            <div>
              <label
                htmlFor="raison_sociale"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Raison sociale
              </label>
              <input
                id="raison_sociale"
                name="raison_sociale"
                required
                placeholder="Acme Sàrl"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="ide" className="mb-1 block text-xs font-medium text-gray-600">
                IDE (optionnel)
              </label>
              <input id="ide" name="ide" placeholder="CHE-123.456.789" className={INPUT_CLASS} />
            </div>
            <div>
              <label
                htmlFor="email_contact"
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Email (optionnel)
              </label>
              <input
                id="email_contact"
                name="email_contact"
                type="email"
                placeholder="contact@acme.ch"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="statut" className="mb-1 block text-xs font-medium text-gray-600">
                Statut
              </label>
              <select id="statut" name="statut" defaultValue="actif" className={INPUT_CLASS}>
                {STATUTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.success && <p className="text-sm text-green-600">Client ajouté avec succès ✓</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Ajout…" : "Ajouter le client →"}
          </button>
        </form>
      </div>
    </section>
  );
}
