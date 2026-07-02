"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import {
  declarerChangementClientAction,
  type PeriodeActionState,
  saisirElementPaieAction,
  validerPeriodeClientAction,
} from "@/app/(app)/espace/validations/actions";
import { Button } from "@/components/ui/button";
import { helpAttrs } from "@/lib/help-attrs";

const TYPES_CHANGEMENT_LABEL: Array<{ value: string; label: string }> = [
  { value: "entree", label: "Entrée (embauche)" },
  { value: "sortie", label: "Sortie (départ)" },
  { value: "changement_salaire", label: "Changement de salaire" },
  { value: "changement_taux", label: "Changement de taux d'activité" },
  { value: "conge_non_paye", label: "Congé non payé" },
  { value: "maladie_longue", label: "Maladie longue" },
  { value: "accident", label: "Accident" },
  { value: "maternite_paternite", label: "Maternité / paternité" },
  { value: "service_militaire", label: "Service militaire" },
  { value: "autre", label: "Autre" },
];

const INITIAL: PeriodeActionState = {};

// Champs natifs (select/input) requis pour la soumission de formulaire — stylés aux tokens DS.
const CHAMP_CLASS =
  "mt-1 rounded-md border border-input bg-card px-2 py-1 text-[13px] text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";

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
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <input type="hidden" name="periode_id" value={periode_id} />
      <label className="flex flex-col text-xs text-muted-foreground">
        Employé
        <select name="employe_id" required className={CHAMP_CLASS}>
          {employes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.prenom} {e.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted-foreground">
        Élément
        <select name="type_element_id" required className={CHAMP_CLASS}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle} ({t.unite})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-muted-foreground">
        Valeur
        <input
          name="valeur_numerique"
          type="number"
          step="any"
          required
          className={`w-28 ${CHAMP_CLASS}`}
        />
      </label>
      <Button
        type="submit"
        disabled={pending}
        {...helpAttrs(
          "Enregistrer l'élément",
          "Ajoute cet élément de paie (heures, prime, absence…) à la période en cours. La dernière valeur saisie l'emporte.",
        )}
      >
        Enregistrer
      </Button>
      {state.error ? <p className="w-full text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="w-full text-sm text-emerald-600">Enregistré.</p> : null}
    </form>
  );
}

export function DeclarerChangementForm({
  periode_id,
  employes,
}: {
  periode_id: string;
  employes: Employe[];
}) {
  const [state, action, pending] = useActionState(declarerChangementClientAction, INITIAL);
  return (
    <details className="rounded-lg border border-border bg-card p-4 shadow-card">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        Déclarer un changement (entrée, sortie, augmentation…)
      </summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="periode_id" value={periode_id} />
        <label className="flex flex-col text-xs text-muted-foreground">
          Type
          <select name="type" required className={CHAMP_CLASS}>
            {TYPES_CHANGEMENT_LABEL.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Employé (optionnel)
          <select name="employe_id" className={CHAMP_CLASS}>
            <option value="">—</option>
            {employes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.prenom} {e.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Date d'effet
          <input name="date_effet" type="date" required className={CHAMP_CLASS} />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Montant (optionnel)
          <input name="montant_impact" type="number" step="any" className={`w-28 ${CHAMP_CLASS}`} />
        </label>
        <label className="flex flex-1 flex-col text-xs text-muted-foreground">
          Description
          <input name="description" type="text" className={CHAMP_CLASS} />
        </label>
        <Button
          type="submit"
          disabled={pending}
          {...helpAttrs(
            "Déclarer un changement",
            "Signale une entrée, une sortie, une absence ou une modification de salaire pour la période. Votre fiduciaire en tient compte au traitement.",
          )}
        >
          Déclarer
        </Button>
        {state.error ? <p className="w-full text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? (
          <p className="w-full text-sm text-emerald-600">Changement déclaré.</p>
        ) : null}
      </form>
    </details>
  );
}

export function ValiderPeriodeForm({ periode_id }: { periode_id: string }) {
  const [state, action, pending] = useActionState(validerPeriodeClientAction, INITIAL);
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="periode_id" value={periode_id} />
          <input type="hidden" name="sans_changement" value="true" />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending}
            {...helpAttrs(
              "Valider sans changement",
              "Confirme que rien n'a changé ce mois-ci et valide la période telle quelle. Votre fiduciaire est aussitôt informée.",
            )}
          >
            Aucun changement, je valide
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="periode_id" value={periode_id} />
          <Button
            type="submit"
            disabled={pending}
            {...helpAttrs(
              "Valider la période",
              "Confirme les éléments et changements saisis, puis transmet la période à votre fiduciaire pour le traitement de la paie.",
            )}
          >
            Valider la période
          </Button>
        </form>
      </div>
      {state.error ? <p className="mt-2 text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? (
        <div
          role="status"
          className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 duration-300 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <p className="text-sm font-medium text-emerald-800">
            Période validée, votre fiduciaire est informée.
          </p>
        </div>
      ) : null}
    </div>
  );
}
