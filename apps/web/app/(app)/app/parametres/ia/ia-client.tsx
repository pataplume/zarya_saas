"use client";

// IA-c — UI activation IA cabinet + suivi des coûts. Textes FR en dur (interface fiduciaire
// interne, convention parametres/*). L'effet réel du flag dépend du kill-switch global
// EXTRACTION_MODE (ADR 0023) — on l'affiche honnêtement à l'utilisateur.
import { useActionState } from "react";
import { helpAttrs } from "@/lib/help-attrs";
import { toggleExtractionIaAction } from "./actions";

interface CoutCabinet {
  nb_invocations: number;
  cout_usd_total: string;
  tokens_input_total: number;
  tokens_output_total: number;
  derniere_invocation_at: string | null;
}

export function IaClient({
  isResponsable,
  cabinetActive,
  globalLive,
  cout,
}: {
  isResponsable: boolean;
  cabinetActive: boolean;
  globalLive: boolean;
  cout: CoutCabinet | null;
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Intelligence artificielle</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active l'extraction et la classification automatiques par IA pour ce cabinet (classement
          des documents, lecture des factures, recherche). Désactivée, l'application fonctionne en
          validation manuelle complète.
        </p>
      </header>

      {!globalLive && (
        <p className="rounded-md border-l-4 border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
          L'IA est actuellement désactivée au niveau de la plateforme (mode démonstration). Activer
          ce cabinet est sans effet tant que ZARYA n'a pas activé l'IA globalement — votre choix
          sera mémorisé et prendra effet à ce moment-là.
        </p>
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-medium text-slate-900">IA du cabinet</h2>
            <p className="mt-1 text-sm text-slate-600">
              {cabinetActive
                ? globalLive
                  ? "Active — les nouveaux documents sont traités par l'IA."
                  : "Activée pour ce cabinet — en attente de l'activation globale."
                : "Désactivée — traitement 100 % manuel."}
            </p>
          </div>
          <StatusBadge cabinetActive={cabinetActive} globalLive={globalLive} />
        </div>

        <div className="mt-5">
          <ToggleButton isResponsable={isResponsable} cabinetActive={cabinetActive} />
        </div>
        {!isResponsable && (
          <p className="mt-3 text-xs text-slate-400">
            Seul un responsable du cabinet peut activer ou désactiver l'IA.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-medium text-slate-900">Consommation IA</h2>
        {cout ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Appels IA" value={cout.nb_invocations.toLocaleString("fr-CH")} />
            <Stat label="Coût total (USD)" value={formatUsd(cout.cout_usd_total)} />
            <Stat
              label="Tokens (in / out)"
              value={`${compact(cout.tokens_input_total)} / ${compact(cout.tokens_output_total)}`}
            />
            <Stat label="Dernier appel" value={formatDate(cout.derniere_invocation_at)} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Aucun appel IA enregistré pour ce cabinet.</p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Coûts agrégés depuis la traçabilité des invocations (extraction.invocation). Mis à jour à
          chaque appel.
        </p>
      </section>
    </div>
  );
}

function ToggleButton({
  isResponsable,
  cabinetActive,
}: {
  isResponsable: boolean;
  cabinetActive: boolean;
}) {
  const [state, action, pending] = useActionState(toggleExtractionIaAction, {});
  const next = cabinetActive ? "false" : "true";
  const label = cabinetActive ? "Désactiver l'IA" : "Activer l'IA";
  const aide = cabinetActive
    ? "Repasse ce cabinet en validation 100 % manuelle : plus aucune extraction ni classement automatique. Réservé au responsable."
    : "Active l'extraction et le classement automatiques. L'IA propose toujours ; un humain valide. La consommation est suivie ici. Réservé au responsable.";
  return (
    <form action={action}>
      <input type="hidden" name="active" value={next} />
      <button
        type="submit"
        disabled={!isResponsable || pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
          cabinetActive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        }`}
        {...helpAttrs(label, aide)}
      >
        {pending ? "…" : label}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function StatusBadge({
  cabinetActive,
  globalLive,
}: {
  cabinetActive: boolean;
  globalLive: boolean;
}) {
  if (cabinetActive && globalLive) {
    return (
      <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        ✓ Active
      </span>
    );
  }
  if (cabinetActive) {
    return (
      <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        En attente
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      Désactivée
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function formatUsd(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-CH");
}
