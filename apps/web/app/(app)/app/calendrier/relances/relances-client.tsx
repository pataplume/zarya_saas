"use client";

import { Check, Clock, Mail, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { useFileKeyboard } from "@/lib/hooks/use-file-keyboard";
import { envoyerLotAction, envoyerRelanceAction, modifierRelanceAction } from "./actions";

export interface RelanceItem {
  relance_id: string;
  /** Client rattaché — sert au lien vers le dossier. */
  client_id: string;
  client_nom: string | null;
  echeance_libelle: string | null;
  date_echeance: string | null;
  destinataire_email: string | null;
  destinataire_nom: string | null;
  sujet: string | null;
  corps: string | null;
  numero_dans_serie: number | null;
}

export function RelancesFile({
  relances,
  peutEnvoyer,
}: {
  relances: RelanceItem[];
  peutEnvoyer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<RelanceItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Optimistic UI : la carte disparaît dès le clic « Envoyer ». Si l'envoi échoue (aucun
  // destinataire, reconnexion Microsoft requise…), la fin de la transition annule l'ajout
  // optimiste (rollback automatique de useOptimistic) → la carte réapparaît et l'erreur est
  // portée par un toast. En succès, revalidatePath renvoie la liste sans l'item avant la fin
  // de la transition → pas de réapparition.
  const [idsEnvoyees, marquerEnvoyees] = useOptimistic<Set<string>, string[]>(
    new Set(),
    (prev, ids) => new Set([...prev, ...ids]),
  );

  const visibles = relances.filter(
    (r) => !dismissed.has(r.relance_id) && !idsEnvoyees.has(r.relance_id),
  );

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function envoyer(id: string) {
    startTransition(async () => {
      marquerEnvoyees([id]);
      const res = await envoyerRelanceAction(id);
      // Seul le succès fait disparaître la carte (la disparition EST le feedback, pas de
      // toast de succès unitaire) ; tout autre statut → rollback + toast d'erreur.
      if (!res.success) toast.error(res.error ?? "Échec de l'envoi.");
      router.refresh();
    });
  }

  function envoyerSelection() {
    const ids = [...selected];
    startTransition(async () => {
      marquerEnvoyees(ids);
      const res = await envoyerLotAction(ids);
      if (res.error) {
        toast.error(res.error);
      } else {
        // Envoi de LOT : un toast de synthèse (succès et/ou échecs), pas un par relance.
        // Les relances en échec réapparaissent d'elles-mêmes (rollback + liste revalidée).
        const envoyees = res.envoyees ?? 0;
        const echecs = res.echecs ?? 0;
        if (envoyees > 0) toast.success(`${envoyees} relance(s) envoyée(s).`);
        if (echecs > 0) toast.error(`${echecs} envoi(s) en échec.`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  // Raccourcis clavier du hook partagé des files de travail :
  // J début · N suivant · P précédent · V envoyer · C modifier.
  useFileKeyboard({
    count: visibles.length,
    cursor,
    setCursor,
    onAction: (i) => {
      if (!peutEnvoyer || pending) return;
      const r = visibles[i];
      if (r) envoyer(r.relance_id);
    },
    onCorriger: (i) => {
      if (!peutEnvoyer) return;
      const r = visibles[i];
      if (r) setEditing(r);
    },
    enabled: editing === null,
  });

  // Garder le curseur valide + visible quand la liste change (y compris après disparition
  // optimiste : le curseur pointe alors l'item suivant visible, jamais hors limites).
  useEffect(() => {
    if (cursor > visibles.length - 1) setCursor(Math.max(0, visibles.length - 1));
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, visibles.length]);

  if (visibles.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="Aucune relance en attente"
        hint="Les brouillons de relance générés par ZARYA apparaîtront ici pour validation avant envoi."
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
          >
            Envoyer la sélection ({selected.size})
          </button>
          <span className="ml-auto hidden text-xs text-slate-400 sm:flex">
            <span>
              Raccourcis : <kbd className="font-semibold">J</kbd> début ·{" "}
              <kbd className="font-semibold">N</kbd> suivant ·{" "}
              <kbd className="font-semibold">V</kbd> envoyer ·{" "}
              <kbd className="font-semibold">C</kbd> modifier
            </span>
          </span>
        </div>
      )}

      <ul className="space-y-3">
        {visibles.map((r, i) => (
          <li
            key={r.relance_id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onMouseDown={() => setCursor(i)}
            className={`rounded border border-slate-200 p-3 transition ${
              i === cursor ? "ring-2 ring-blue-500" : ""
            }`}
          >
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
                  <Link
                    href={`/app/clients/${r.client_id}`}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {r.client_nom ?? "Client"}
                  </Link>{" "}
                  — {r.echeance_libelle ?? "Échéance"}
                </p>
                <p className="text-sm text-slate-500">
                  À : {r.destinataire_email ?? "— aucun destinataire —"}
                  {r.date_echeance ? ` · échéance ${r.date_echeance}` : ""}
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-slate-400">Sujet :</span> {r.sujet ?? "—"}
                </p>
                {expanded.has(r.relance_id) && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm">
                    {r.corps ?? ""}
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
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => envoyer(r.relance_id)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-green-700 disabled:opacity-40"
                      >
                        <Check className="size-3.5" aria-hidden />
                        Envoyer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="inline-flex items-center gap-1 text-sm text-slate-700"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                        Modifier
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed((s) => toggle(s, r.relance_id))}
                    className="inline-flex items-center gap-1 text-sm text-slate-500"
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

      {editing && (
        <ModifierModal
          relance={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={(formData) =>
            startTransition(async () => {
              const res = await modifierRelanceAction(formData);
              setMessage(res.success ? "Relance modifiée." : (res.error ?? "Erreur."));
              setEditing(null);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

function ModifierModal({
  relance,
  pending,
  onClose,
  onSubmit,
}: {
  relance: RelanceItem;
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
        aria-label="Modifier la relance"
        className="relative z-10 w-full max-w-lg rounded bg-white p-4 shadow-lg"
      >
        <h2 className="mb-3 text-lg font-semibold">Modifier la relance</h2>
        <form action={onSubmit}>
          <input type="hidden" name="relanceId" value={relance.relance_id} />
          <label className="block text-sm font-medium" htmlFor="sujet">
            Sujet
          </label>
          <input
            id="sujet"
            name="sujet"
            defaultValue={relance.sujet ?? ""}
            className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <label className="block text-sm font-medium" htmlFor="corps">
            Corps
          </label>
          <textarea
            id="corps"
            name="corps"
            defaultValue={relance.corps ?? ""}
            rows={8}
            className="mb-4 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm">
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
