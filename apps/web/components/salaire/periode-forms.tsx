"use client";

import { useActionState } from "react";
import {
  type PeriodeActionState,
  saisirElementPaieAction,
  validerPeriodeClientAction,
} from "@/app/(app)/espace/validations/actions";

const INITIAL: PeriodeActionState = {};

interface Employe {
  id: string;
  prenom: string;
  nom: string;
}
interface TypeElement {
  id: string;
  code: string;
  libelle: string;
  unite: string;
}

// G3a — Formulaires client de saisie d'un élément + validation de la période. Last-write-wins.
export function SaisieElementForm({
  periode_id,
  employes,
  types,
}: {
  periode_id: string;
  employes: Employe[];
  types: TypeElement[];
}) {
  const [state, action, pending] = useActionState(saisirElementPaieAction, INITIAL);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4"
    >
      <input type="hidden" name="periode_id" value={periode_id} />
      <label className="flex flex-col text-xs text-gray-500">
        Employé
        <select
          name="employe_id"
          required
          className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {employes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.prenom} {e.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Élément
        <select
          name="type_element_id"
          required
          className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle} ({t.unite})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-500">
        Valeur
        <input
          name="valeur_numerique"
          type="number"
          step="any"
          required
          className="mt-1 w-28 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Enregistrer
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="w-full text-sm text-green-600">Enregistré.</p> : null}
    </form>
  );
}

export function ValiderPeriodeForm({ periode_id }: { periode_id: string }) {
  const [state, action, pending] = useActionState(validerPeriodeClientAction, INITIAL);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="periode_id" value={periode_id} />
          <input type="hidden" name="sans_changement" value="true" />
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Aucun changement, je valide
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="periode_id" value={periode_id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Valider la période
          </button>
        </form>
      </div>
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
      {state.success ? (
        <p className="mt-2 text-sm text-green-600">Période validée. Merci !</p>
      ) : null}
    </div>
  );
}
