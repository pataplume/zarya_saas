"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { envoyerLotRelancesSalaireAction, envoyerRelanceSalaireAction } from "./actions";

export interface RelanceSalaireItem {
  relance_id: string;
  client_nom: string | null;
  periode_libelle: string;
  date_limite: string | null;
  destinataire_email: string | null;
  sujet: string;
  corps: string;
  numero: number | null;
}

export function RelancesSalaireFile({
  relances,
  peutEnvoyer,
}: {
  relances: RelanceSalaireItem[];
  peutEnvoyer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const visibles = relances.filter((r) => !dismissed.has(r.relance_id));

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function envoyer(id: string) {
    startTransition(async () => {
      const res = await envoyerRelanceSalaireAction(id);
      setMessage(res.success ? "Relance envoyée." : (res.error ?? "Erreur."));
      router.refresh();
    });
  }

  function envoyerSelection() {
    const ids = [...selected];
    startTransition(async () => {
      const res = await envoyerLotRelancesSalaireAction(ids);
      setMessage(
        res.error ??
          `${res.envoyees ?? 0} envoyée(s), ${res.echecs ?? 0} échec(s), ${res.ignores ?? 0} ignorée(s).`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  if (visibles.length === 0) {
    return <p className="text-gray-500">Aucune relance salaire en attente. 🎉</p>;
  }

  return (
    <div>
      {message && (
        <div className="mb-4 rounded bg-gray-100 px-3 py-2 text-sm" role="status">
          {message}
        </div>
      )}

      {peutEnvoyer && (
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={envoyerSelection}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Envoyer la sélection ({selected.size})
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {visibles.map((r) => (
          <li key={r.relance_id} className="rounded border border-gray-200 p-3">
            <div className="flex items-start gap-3">
              {peutEnvoyer && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(r.relance_id)}
                  onChange={() => setSelected((s) => toggle(s, r.relance_id))}
                  aria-label={`Sélectionner la relance ${r.client_nom ?? ""}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.client_nom ?? "Client"} — salaires {r.periode_libelle}
                </p>
                <p className="text-sm text-gray-500">
                  À : {r.destinataire_email ?? "— aucun destinataire actif —"}
                  {r.date_limite ? ` · échéance ${r.date_limite}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-gray-400">Sujet :</span> {r.sujet}
                </p>
                {expanded.has(r.relance_id) && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm">
                    {r.corps}
                  </pre>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => toggle(s, r.relance_id))}
                    className="text-sm text-blue-600"
                  >
                    {expanded.has(r.relance_id) ? "Masquer" : "Aperçu"}
                  </button>
                  {peutEnvoyer && (
                    <button
                      type="button"
                      disabled={pending || !r.destinataire_email}
                      onClick={() => envoyer(r.relance_id)}
                      className="text-sm font-medium text-green-700 disabled:opacity-40"
                    >
                      ✓ Envoyer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed((s) => toggle(s, r.relance_id))}
                    className="text-sm text-gray-500"
                  >
                    ⏭ Plus tard
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
