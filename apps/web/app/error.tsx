"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary racine : attrape les erreurs de rendu des Server/Client
 * Components. Aucun détail technique n'est affiché (pas de fuite d'info) —
 * l'erreur part dans les logs serveur/console.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // biome-ignore lint/suspicious/noConsole: trace client volontaire (digest pour corréler aux logs serveur)
    console.error("Erreur applicative", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-4xl" aria-hidden>
          ⚠️
        </p>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          L'action n'a pas pu aboutir. Réessayez — si le problème persiste, contactez le support
          ZARYA en mentionnant l'heure de l'incident.
        </p>
        <Button type="button" onClick={reset} className="mt-6">
          <RotateCcw aria-hidden />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
