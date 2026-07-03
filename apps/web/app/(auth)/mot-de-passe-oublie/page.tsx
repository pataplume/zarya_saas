"use client";

// Run 6 — demande de réinitialisation de mot de passe.
import { Check } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demanderReinitialisationAction } from "./actions";

export default function MotDePasseOubliePage() {
  const [state, action, isPending] = useActionState(demanderReinitialisationAction, {});

  if (state.success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <Check
            className="h-6 w-6 text-emerald-600"
            strokeWidth={2}
            role="img"
            aria-label="Succès"
          />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Vérifiez votre email
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-foreground hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">
        Mot de passe oublié
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Indiquez votre email professionnel, nous vous envoyons un lien pour choisir un nouveau mot
        de passe.
      </p>

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1"
            placeholder="sophie@cabinet-example.ch"
          />
        </div>

        <div aria-live="polite">
          {state.error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {state.error}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Envoi…" : "Envoyer le lien de réinitialisation"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
