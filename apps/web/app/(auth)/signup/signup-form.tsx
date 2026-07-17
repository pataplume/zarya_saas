"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "./actions";

// P0-7 — formulaire d'inscription (client). `inviteRequis` vient du server component
// (page.tsx) : seul ce booléen traverse la frontière serveur→client, jamais le code
// d'invitation lui-même (vérifié côté serveur dans actions.ts).
export function SignupForm({ inviteRequis }: { inviteRequis: boolean }) {
  const [state, action, isPending] = useActionState(signupAction, {});
  const [password, setPassword] = useState("");
  const fieldErrors = state.fieldErrors;

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
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-medium text-foreground">{state.email}</span>.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cliquez sur le lien pour activer votre compte.
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
      <h2 className="mb-6 text-lg font-semibold tracking-tight text-foreground">Créer un compte</h2>

      <form action={action} className="space-y-4">
        {inviteRequis && (
          <div>
            <Label htmlFor="inviteCode">Code d&apos;invitation</Label>
            <Input
              id="inviteCode"
              name="inviteCode"
              type="text"
              autoComplete="off"
              required
              className="mt-1"
              placeholder="Code reçu de l'équipe ZARYA"
              aria-invalid={fieldErrors?.inviteCode ? true : undefined}
              aria-describedby={fieldErrors?.inviteCode ? "invite-code-error" : undefined}
            />
            {fieldErrors?.inviteCode && (
              <p id="invite-code-error" className="mt-1 text-xs text-rose-600">
                {fieldErrors.inviteCode}
              </p>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="email">Email professionnel</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1"
            placeholder="sophie@cabinet-example.ch"
            aria-invalid={fieldErrors?.email ? true : undefined}
            aria-describedby={fieldErrors?.email ? "email-error" : undefined}
          />
          {fieldErrors?.email && (
            <p id="email-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1"
            placeholder="12 caractères minimum"
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors?.password ? true : undefined}
            aria-describedby={fieldErrors?.password ? "password-error" : undefined}
          />
          <PasswordStrength password={password} />
          {fieldErrors?.password && (
            <p id="password-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1"
            placeholder="••••••••••••"
            aria-invalid={fieldErrors?.confirmPassword ? true : undefined}
            aria-describedby={fieldErrors?.confirmPassword ? "confirm-password-error" : undefined}
          />
          {fieldErrors?.confirmPassword && (
            <p id="confirm-password-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="acceptCgu"
              value="on"
              required
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              aria-invalid={fieldErrors?.acceptCgu ? true : undefined}
              aria-describedby={fieldErrors?.acceptCgu ? "accept-cgu-error" : undefined}
            />
            <span className="text-sm text-muted-foreground">
              J&apos;accepte les{" "}
              <a
                href="/cgu"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                Conditions générales d&apos;utilisation
              </a>{" "}
              et la{" "}
              <a
                href="/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline"
              >
                politique de confidentialité
              </a>
            </span>
          </label>
          {fieldErrors?.acceptCgu && (
            <p id="accept-cgu-error" className="mt-1 text-xs text-rose-600">
              {fieldErrors.acceptCgu}
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
          {isPending ? "Création du compte…" : "Créer mon compte"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
