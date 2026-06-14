"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  badgeStatutEcheance,
  libelleStatutEcheance,
  libelleTypeEcheance,
  styleFamille,
} from "@/lib/libelles";
import { annulerEcheanceAction, marquerTraiteeAction, reporterEcheanceAction } from "./actions";

export interface EcheanceRow {
  id: string;
  /** Client rattaché — sert au lien vers le dossier. */
  client_id: string;
  client_nom: string | null;
  type: string;
  libelle: string;
  date_echeance: string | null;
  statut: string;
  reporte_a: string | null;
  motif_report: string | null;
}

const STATUTS_ACTIONNABLES = new Set(["a_venir", "imminente", "en_retard"]);

export function EcheancesListe({
  echeances,
  statuts,
  types,
  filtres,
  peutAgir,
}: {
  echeances: EcheanceRow[];
  statuts: string[];
  types: string[];
  filtres: { statut: string; type: string; q: string };
  peutAgir: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reporting, setReporting] = useState<EcheanceRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function appliquerFiltres(form: FormData) {
    const params = new URLSearchParams();
    for (const k of ["statut", "type", "q"] as const) {
      const v = String(form.get(k) ?? "").trim();
      if (v) params.set(k, v);
    }
    router.push(`/app/calendrier/echeances?${params.toString()}`);
  }

  function agir(action: () => Promise<{ success?: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await action();
      setMessage(res.success ? ok : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  return (
    <div>
      <form action={appliquerFiltres} className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Statut</span>
          <select name="statut" defaultValue={filtres.statut} className="rounded border px-2 py-1">
            <option value="">Tous</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {libelleStatutEcheance(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Type</span>
          <select name="type" defaultValue={filtres.type} className="rounded border px-2 py-1">
            <option value="">Tous</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {libelleTypeEcheance(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-1 text-gray-500">Client</span>
          <input
            name="q"
            defaultValue={filtres.q}
            placeholder="Raison sociale…"
            className="rounded border px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
          Filtrer
        </button>
      </form>

      {message && (
        <div className="mb-4 rounded bg-gray-100 px-3 py-2 text-sm" role="status">
          {message}
        </div>
      )}

      {echeances.length === 0 ? (
        <p className="text-gray-500">Aucune échéance.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Date</th>
              <th>Client</th>
              <th>Type</th>
              <th>Libellé</th>
              <th>Statut</th>
              {peutAgir && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {echeances.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2">{e.date_echeance ?? "—"}</td>
                <td>
                  <Link
                    href={`/app/clients/${e.client_id}`}
                    className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {e.client_nom ?? "—"}
                  </Link>
                </td>
                <td>{libelleTypeEcheance(e.type)}</td>
                <td>
                  {e.libelle}
                  {e.statut === "reportee" && e.reporte_a && (
                    <span className="ml-1 text-xs text-blue-700">→ {e.reporte_a}</span>
                  )}
                </td>
                <td>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styleFamille(
                      badgeStatutEcheance(e.statut).famille,
                    )} ${e.statut === "annulee" ? "line-through" : ""}`}
                  >
                    {libelleStatutEcheance(e.statut)}
                  </span>
                </td>
                {peutAgir && (
                  <td className="space-x-2 whitespace-nowrap">
                    {STATUTS_ACTIONNABLES.has(e.statut) ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            agir(() => marquerTraiteeAction(e.id), "Échéance traitée.")
                          }
                          className="text-green-700 disabled:opacity-40"
                        >
                          Traiter
                        </button>
                        <button
                          type="button"
                          onClick={() => setReporting(e)}
                          className="text-blue-700"
                        >
                          Reporter
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            agir(() => annulerEcheanceAction(e.id), "Échéance annulée.")
                          }
                          className="text-gray-500 disabled:opacity-40"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reporting && (
        <ReporterModal
          echeance={reporting}
          pending={pending}
          onClose={() => setReporting(null)}
          onSubmit={(formData) =>
            startTransition(async () => {
              const res = await reporterEcheanceAction(formData);
              setMessage(res.success ? "Échéance reportée." : (res.error ?? "Erreur."));
              setReporting(null);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

function ReporterModal({
  echeance,
  pending,
  onClose,
  onSubmit,
}: {
  echeance: EcheanceRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reporter l'échéance"
        className="relative z-10 w-full max-w-sm rounded bg-white p-4 shadow-lg"
      >
        <h2 className="mb-3 text-lg font-semibold">Reporter — {echeance.libelle}</h2>
        <form action={onSubmit}>
          <input type="hidden" name="echeanceId" value={echeance.id} />
          <label className="block text-sm font-medium" htmlFor="reporteA">
            Nouvelle date
          </label>
          <input
            id="reporteA"
            name="reporteA"
            type="date"
            required
            className="mb-3 w-full rounded border px-2 py-1 text-sm"
          />
          <label className="block text-sm font-medium" htmlFor="motif">
            Motif (optionnel)
          </label>
          <input id="motif" name="motif" className="mb-4 w-full rounded border px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm">
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              Reporter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
