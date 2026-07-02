"use client";

// Run D1 — formulaire public de demande d'accès. Sur succès : message de confirmation.
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { creerDemandeAccesAction, type DemandeState } from "./actions";

const INITIAL: DemandeState = {};

export function DemandeForm() {
  const [state, action, pending] = useActionState(creerDemandeAccesAction, INITIAL);

  if (state.success) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
        <p className="font-medium">Merci, votre demande a bien été envoyée.</p>
        <p className="mt-1">Notre équipe vous recontactera rapidement.</p>
        <Link href="/" className="mt-3 inline-block text-xs font-medium text-emerald-700 underline">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field id="nom" name="nom" label="Votre nom" required />
      <Field id="email" name="email" label="Email professionnel" type="email" required />
      <Field id="cabinet_nom" name="cabinet_nom" label="Nom du cabinet (optionnel)" />
      <div>
        <Label htmlFor="message">Message (optionnel)</Label>
        <Textarea id="message" name="message" rows={3} className="mt-1" />
      </div>
      {/* Honeypot anti-spam : caché des humains, rempli par les bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} required={required} className="mt-1" />
    </div>
  );
}
