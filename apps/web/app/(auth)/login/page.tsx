"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, isPending] = useActionState(loginAction, {});

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Connexion</h2>

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

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1"
            placeholder="••••••••••••"
          />
        </div>

        {/* Erreur volontairement générique (ne pas révéler quel champ est faux). */}
        <div aria-live="polite">
          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-gray-900 hover:underline">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
