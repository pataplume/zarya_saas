"use client";

// Run 6 — formulaire « choisir un nouveau mot de passe » après clic sur le lien de
// réinitialisation reçu par email (session recovery temporaire posée par Supabase via
// /auth/callback?next=/reinitialiser-mot-de-passe).
import { useActionState, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ReinitialiserState, reinitialiserMotDePasseAction } from "./actions";

const INITIAL: ReinitialiserState = {};

export default function ReinitialiserMotDePassePage() {
  const [state, action, isPending] = useActionState(reinitialiserMotDePasseAction, INITIAL);
  const [password, setPassword] = useState("");
  const fieldErrors = state.fieldErrors;

  return (
    <>
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">
        Nouveau mot de passe
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">Choisissez votre nouveau mot de passe.</p>

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            className="mt-1"
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors?.password ? true : undefined}
            aria-describedby={
              fieldErrors?.password ? "password-hint password-error" : "password-hint"
            }
          />
          <p id="password-hint" className="mt-1 text-xs text-muted-foreground">
            Au moins 12 caractères.
          </p>
          <PasswordStrength password={password} />
          {fieldErrors?.password && (
            <p id="password-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="confirm">Confirmez le mot de passe</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            className="mt-1"
            aria-invalid={fieldErrors?.confirm ? true : undefined}
            aria-describedby={fieldErrors?.confirm ? "confirm-error" : undefined}
          />
          {fieldErrors?.confirm && (
            <p id="confirm-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.confirm}
            </p>
          )}
        </div>

        <div aria-live="polite">
          {state.error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {state.error}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
        </Button>
      </form>
    </>
  );
}
