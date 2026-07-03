"use client";

import { Check, CheckCircle2, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { helpAttrs } from "@/lib/help-attrs";
import {
  envoyerLotRelancesSalaireAction,
  envoyerRelanceSalaireAction,
  snoozerRelanceSalaireAction,
} from "./actions";

/** Durée du snooze déclenché par le bouton « Traiter plus tard » (RUN6 usabilité). */
const SNOOZE_JOURS_DEFAUT = 1;

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

  function snoozer(id: string) {
    startTransition(async () => {
      const res = await snoozerRelanceSalaireAction(id, SNOOZE_JOURS_DEFAUT);
      if (res.success) {
        setDismissed((s) => toggle(s, id));
        setMessage("Relance reportée à demain.");
      } else {
        setMessage(res.error ?? "Échec du report.");
      }
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
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Aucune relance salaire en attente"
        hint="Les relances liées aux périodes de salaire en retard apparaîtront ici pour validation avant envoi."
      />
    );
  }

  return (
    <div>
      {message && (
        <div className="mb-4 rounded bg-slate-100 px-3 py-2 text-sm" role="status">
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
            {...helpAttrs(
              "Envoyer la sélection",
              "Envoie en une fois toutes les relances cochées, depuis la boîte du cabinet. Les relances sans destinataire actif sont ignorées.",
            )}
          >
            Envoyer la sélection ({selected.size})
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {visibles.map((r) => (
          <li key={r.relance_id} className="rounded border border-slate-200 p-3">
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
                <p className="text-sm text-slate-500">
                  À : {r.destinataire_email ?? "— aucun destinataire actif —"}
                  {r.date_limite ? ` · échéance ${r.date_limite}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-slate-400">Sujet :</span> {r.sujet}
                </p>
                {expanded.has(r.relance_id) && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm">
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
                      className="inline-flex items-center gap-1 text-sm font-medium text-green-700 disabled:opacity-40"
                      {...helpAttrs(
                        "Envoyer la relance",
                        "Envoie cette relance au client depuis la boîte du cabinet. Indisponible tant qu'aucun destinataire actif n'est renseigné.",
                      )}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Envoyer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => snoozer(r.relance_id)}
                    className="inline-flex items-center gap-1 text-sm text-slate-500 disabled:opacity-40"
                    {...helpAttrs(
                      "Traiter plus tard",
                      "Reporte cette relance d'un jour : elle disparaît de la file et réapparaîtra demain.",
                    )}
                  >
                    <Clock className="size-3.5" aria-hidden />
                    Plus tard
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
