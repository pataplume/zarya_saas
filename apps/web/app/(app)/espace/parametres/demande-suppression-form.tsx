"use client";

// Run I1 — formulaire client : demande de suppression d'accès (routée vers le cabinet).
import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { demanderSuppressionClientAction, type SuppressionClientState } from "./actions";

const INITIAL: SuppressionClientState = {};

export function DemandeSuppressionForm() {
  const [state, action, pending] = useActionState(demanderSuppressionClientAction, INITIAL);

  if (state.success) {
    return (
      <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
        Votre demande a bien été enregistrée. Votre fiduciaire la traitera et vous recontactera.
      </p>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <Label htmlFor="motif">Motif (optionnel)</Label>
        <Textarea id="motif" name="motif" rows={2} className="mt-1" />
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center rounded-md border border-rose-200 bg-card px-3 text-[13px] font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Demander la suppression de mon accès"}
      </button>
    </form>
  );
}
