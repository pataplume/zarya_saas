"use client";

// Run C1 — formulaire « définir mon mot de passe » pour l'activation d'un compte invité.
import { useActionState, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActiverState, definirMotDePasseAction } from "./actions";

const INITIAL: ActiverState = {};

export function ActiverForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(definirMotDePasseAction, INITIAL);
  const [password, setPassword] = useState("");
  const fieldErrors = state.fieldErrors;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="password">Choisissez un mot de passe</Label>
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
        <p id="password-hint" className="mt-1 text-xs text-gray-400">
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
        {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Activation…" : "Activer mon compte"}
      </Button>
    </form>
  );
}
