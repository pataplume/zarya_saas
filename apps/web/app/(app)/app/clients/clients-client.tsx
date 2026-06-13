"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  archiverClientAction,
  type ClientActionState,
  createClientAction,
  updateClientAction,
} from "./actions";
import type { ClientRow } from "./page";

type Props = {
  clients: ClientRow[];
  archives: ClientRow[];
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

const TYPE_LABEL: Record<string, string> = {
  pme: "PME",
  independant: "Indépendant",
  prive: "Privé",
  association: "Association",
};

// Risque : libellé + style + symbole (jamais couleur seule, cf. UX § « pas de couleur seule »).
const RISQUE_META: Record<string, { label: string; style: string; symbole: string }> = {
  faible: {
    label: "Faible",
    style: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    symbole: "●",
  },
  moyen: { label: "Moyen", style: "bg-amber-50 text-amber-700 ring-amber-600/20", symbole: "◐" },
  eleve: { label: "Élevé", style: "bg-orange-50 text-orange-700 ring-orange-600/20", symbole: "▲" },
  critique: { label: "Critique", style: "bg-red-50 text-red-700 ring-red-600/20", symbole: "■" },
};

const STATUTS = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "inactif", label: "Inactif" },
];

const FILTRES_RISQUE = [
  { value: "tous", label: "Tous risques" },
  { value: "critique", label: "Critique" },
  { value: "eleve", label: "Élevé" },
  { value: "moyen", label: "Moyen" },
  { value: "faible", label: "Faible" },
];

const FILTRES_STATUT = [
  { value: "tous", label: "Tous statuts" },
  { value: "actif", label: "Actif" },
  { value: "prospect", label: "Prospect" },
  { value: "inactif", label: "Inactif" },
];

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const SELECT_FILTRE_CLASS =
  "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

// Formate une date ISO (YYYY-MM-DD ou ISO complet) en jj.mm.aaaa, ou "—".
function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Dernière activité en relatif (« il y a 3 j », « aujourd'hui »…), ou "—".
function formatRelatif(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const jours = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  if (jours < 30) return `Il y a ${jours} j`;
  if (jours < 365) return `Il y a ${Math.floor(jours / 30)} mois`;
  return `Il y a ${Math.floor(jours / 365)} an(s)`;
}

export function ClientsClient({ clients, archives, peutEcrire, isResponsable }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtreRisque, setFiltreRisque] = useState("tous");
  const [filtreStatut, setFiltreStatut] = useState("tous");

  const actifs = useMemo(
    () =>
      clients.filter((c) => {
        if (filtreRisque !== "tous" && c.risque_niveau !== filtreRisque) return false;
        if (filtreStatut !== "tous" && c.statut !== filtreStatut) return false;
        return true;
      }),
    [clients, filtreRisque, filtreStatut],
  );

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">
          Les PME que votre cabinet gère. Cliquez un client pour ouvrir son dossier.
        </p>
      </div>

      {/* Liste des clients actifs */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Clients · {actifs.length}
          </h2>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="filtre-risque">
              Filtrer par risque
            </label>
            <select
              id="filtre-risque"
              value={filtreRisque}
              onChange={(e) => setFiltreRisque(e.target.value)}
              className={SELECT_FILTRE_CLASS}
            >
              {FILTRES_RISQUE.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="filtre-statut">
              Filtrer par statut
            </label>
            <select
              id="filtre-statut"
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className={SELECT_FILTRE_CLASS}
            >
              {FILTRES_STATUT.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {actifs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Aucun client à afficher</p>
            <p className="mt-1 text-xs text-slate-400">
              {peutEcrire
                ? "Ajustez les filtres ou ajoutez un client ci-dessous."
                : "Ajustez les filtres pour voir vos clients."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {/* En-tête de colonnes (desktop) */}
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 lg:grid">
              <span>Raison sociale</span>
              <span>Type</span>
              <span>Statut</span>
              <span>Risque</span>
              <span>Prochaine échéance</span>
              <span>Docs manq.</span>
              <span>Dernière activité</span>
              <span className="sr-only">Actions</span>
            </div>

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
              <Link
                key={c.id}
                href={`/app/clients/${c.id}`}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-100 ${
                  idx < archives.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-500">{c.raison_sociale}</p>
                  {c.ide && <p className="truncate text-xs text-gray-400">{c.ide}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-400/20">
                  Archivé
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Badge de risque ──────────────────────────────────────────────────────────

function RisqueBadge({ niveau, score }: { niveau: string | null; score: number | null }) {
  if (!niveau) return <span className="text-xs text-gray-400">—</span>;
  const meta = RISQUE_META[niveau] ?? {
    label: niveau,
    style: "bg-slate-100 text-slate-600 ring-slate-500/20",
    symbole: "•",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${meta.style}`}
      title={score != null ? `Score ${score}` : undefined}
    >
      <span aria-hidden="true">{meta.symbole}</span>
      {meta.label}
      {score != null && <span className="font-normal opacity-70">· {score}</span>}
    </span>
  );
}

// ─── Ligne en lecture (cliquable → dossier) ───────────────────────────────────

function DisplayRow({
  client,
  isLast,
  peutEcrire,
  isResponsable,
  onEdit,
}: {
  client: ClientRow;
  isLast: boolean;
  peutEcrire: boolean;
  isResponsable: boolean;
  onEdit: () => void;
}) {
  const statutStyle =
    STATUT_STYLE[client.statut] ?? "bg-slate-100 text-slate-600 ring-slate-500/20";
  return (
    <div
      className={`grid grid-cols-1 items-center gap-3 px-4 py-3 hover:bg-gray-50 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_0.8fr_1fr_auto] ${
        isLast ? "" : "border-b border-gray-100"
      }`}
    >
      {/* Raison sociale → lien dossier */}
      <Link href={`/app/clients/${client.id}`} className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 hover:text-blue-700">
          {client.raison_sociale}
        </p>
        {client.ide && <p className="truncate text-xs text-gray-400 lg:hidden">{client.ide}</p>}
      </Link>

      {/* Type */}
      <span className="text-sm text-gray-600">
        {client.type ? (TYPE_LABEL[client.type] ?? client.type) : "—"}
      </span>

      {/* Statut */}
      <span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statutStyle}`}
        >
          {STATUT_LABEL[client.statut] ?? client.statut}
        </span>
      </span>

      {/* Risque */}
      <span>
        <RisqueBadge niveau={client.risque_niveau} score={client.risque_score} />
      </span>

      {/* Prochaine échéance */}
      <span className="text-sm text-gray-600">{formatDate(client.prochaine_echeance)}</span>

      {/* Docs manquants */}
      <span className="text-sm">
        {client.nb_documents_manquants > 0 ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {client.nb_documents_manquants}
          </span>
        ) : (
          <span className="text-gray-400">0</span>
        )}
      </span>

      {/* Dernière activité */}
      <span className="text-sm text-gray-500">{formatRelatif(client.derniere_activite)}</span>

      {/* Actions (édition / archivage) */}
      <div className="flex shrink-0 items-center gap-2 justify-self-end">
        {peutEcrire && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none"
          >
            Modifier
          </button>
        )}
        {isResponsable && (
          <form action={archiverClientAction}>
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
    </div>
  );
}

// ─── Ligne en édition ─────────────────────────────────────────────────────────

function EditRow({
  client,
  isLast,
  onDone,
}: {
  client: ClientRow;
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
