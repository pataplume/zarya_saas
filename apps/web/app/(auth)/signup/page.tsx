"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "./actions";

export default function SignupPage() {
  const [state, action, isPending] = useActionState(signupAction, {});
  const [password, setPassword] = useState("");
  const fieldErrors = state.fieldErrors;

  if (state.success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            role="img"
            aria-label="Succès"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Vérifiez votre email</h2>
        <p className="mt-2 text-sm text-gray-500">
          Un lien de confirmation a été envoyé à{" "}
          <span className="font-medium text-gray-900">{state.email}</span>.
        </p>
        <p className="mt-1 text-sm text-gray-500">Cliquez sur le lien pour activer votre compte.</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-gray-900 hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Créer un compte</h2>

      <form action={action} className="space-y-4">
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
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              aria-invalid={fieldErrors?.acceptCgu ? true : undefined}
              aria-describedby={fieldErrors?.acceptCgu ? "accept-cgu-error" : undefined}
            />
            <span className="text-sm text-gray-600">
              J&apos;accepte les{" "}
              <a
                href="/cgu"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-900 hover:underline"
              >
                Conditions générales d&apos;utilisation
              </a>{" "}
              et la{" "}
              <a
                href="/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-900 hover:underline"
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
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Création du compte…" : "Créer mon compte"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-gray-900 hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
