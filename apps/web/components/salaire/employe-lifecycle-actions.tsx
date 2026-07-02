"use client";

// G7b — Formulaires de cycle de vie employé (fiduciaire) câblés sur les server actions G7a.
// useActionState ; chaque action est inline (pas de modal hell, UX ZARYA §3). Les mouvements
// (sortie/modification) requièrent une période ouverte ; l'archivage n'en a pas besoin.

import { useActionState } from "react";
import {
  archiverEmployeAction,
  modifierReferentielAction,
  type SalaireFiduciaireState,
  sortirEmployeAction,
} from "@/app/(app)/app/salaire/actions";
import { helpAttrs } from "@/lib/help-attrs";

const INITIAL: SalaireFiduciaireState = {};

function Feedback({ state }: { state: SalaireFiduciaireState }) {
  if (state.error) return <span className="text-xs text-red-600">{state.error}</span>;
  if (state.success) return <span className="text-xs text-green-600">✓ Enregistré</span>;
  return null;
}

/** Sortie d'un employé actif. Désactivé si aucune période ouverte. */
export function SortieForm({
  employeId,
  periodeId,
}: {
  employeId: string;
  periodeId: string | null;
}) {
  const [state, action, pending] = useActionState(sortirEmployeAction, INITIAL);
  if (!periodeId) return <span className="text-xs text-gray-400">Aucune période ouverte</span>;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="employe_id" value={employeId} />
      <input type="hidden" name="periode_id" value={periodeId} />
      <input
        type="date"
        name="date_sortie"
        required
        aria-label="Date de sortie"
        className="rounded border border-gray-300 px-1 py-0.5 text-xs"
      />
      <input
        type="text"
        name="motif"
        placeholder="Motif (optionnel)"
        className="w-32 rounded border border-gray-300 px-1 py-0.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        {...helpAttrs(
          "Sortir un employé",
          "Enregistre le départ de l'employé à la date indiquée. Le changement est déclaré sur la période ouverte ; l'employé pourra ensuite être archivé.",
        )}
      >
        Sortir
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Modification du référentiel (salaire ou taux) d'un employé actif. */
export function ModificationForm({
  employeId,
  periodeId,
}: {
  employeId: string;
  periodeId: string | null;
}) {
  const [state, action, pending] = useActionState(modifierReferentielAction, INITIAL);
  if (!periodeId) return <span className="text-xs text-gray-400">Aucune période ouverte</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="employe_id" value={employeId} />
      <input type="hidden" name="periode_id" value={periodeId} />
      <select
        name="type"
        aria-label="Type de modification"
        className="rounded border border-gray-300 px-1 py-0.5 text-xs"
      >
        <option value="changement_salaire">Salaire</option>
        <option value="changement_taux">Taux</option>
      </select>
      <input
        type="number"
        step="0.01"
        name="nouveau_salaire_base"
        placeholder="Nouveau salaire"
        className="w-28 rounded border border-gray-300 px-1 py-0.5 text-xs"
      />
      <input
        type="number"
        step="0.01"
        name="nouveau_taux_activite"
        placeholder="Nouveau taux %"
        className="w-24 rounded border border-gray-300 px-1 py-0.5 text-xs"
      />
      <input
        type="date"
        name="date_effet"
        required
        aria-label="Date d'effet"
        className="rounded border border-gray-300 px-1 py-0.5 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        {...helpAttrs(
          "Modifier le référentiel",
          "Enregistre un changement de salaire ou de taux à la date d'effet indiquée. Le changement est rattaché à la période ouverte.",
        )}
      >
        Modifier
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Archivage d'un employé sorti (terminal). */
export function ArchiveForm({ employeId }: { employeId: string }) {
  const [state, action, pending] = useActionState(archiverEmployeAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="employe_id" value={employeId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        {...helpAttrs(
          "Archiver un employé",
          "Retire définitivement l'employé sorti du référentiel actif. Il n'apparaîtra plus dans les campagnes suivantes ; son historique reste conservé.",
        )}
      >
        Archiver
      </button>
      <Feedback state={state} />
    </form>
  );
}
