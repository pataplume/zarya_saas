"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster global ZARYA (monté une fois par layout racine de surface).
 * Rappel UX : pas de toast pour chaque action — réservé aux confirmations
 * d'actions asynchrones/destructives et aux erreurs hors formulaire.
 */
function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border bg-card text-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster };
