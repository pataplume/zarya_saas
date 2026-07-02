"use client";

// C5.2 — Édition du profil côté espace client : nom affiché, mot de passe, adresse e-mail.
// Trois formulaires indépendants (un état par action) pour des retours ciblés. Aucun mot de
// passe n'est conservé côté client au-delà de la soumission.
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  modifierEmailAction,
  modifierMotDePasseAction,
  modifierNomAfficheAction,
  type ProfilClientState,
} from "./actions";

const INITIAL: ProfilClientState = {};

function Feedback({ state }: { state: ProfilClientState }) {
  if (state.success) {
    return (
      <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
        {state.success}
      </p>
    );
  }
  if (state.error) {
    return <p className="text-sm text-rose-600">{state.error}</p>;
  }
  return null;
}

export function ProfilForm({
  emailActuel,
  nomActuel,
}: {
  emailActuel: string | null;
  nomActuel: string;
}) {
  const [nomState, nomAction, nomPending] = useActionState(modifierNomAfficheAction, INITIAL);
  const [mdpState, mdpAction, mdpPending] = useActionState(modifierMotDePasseAction, INITIAL);
  const [emailState, emailAction, emailPending] = useActionState(modifierEmailAction, INITIAL);

  return (
    <div className="space-y-4">
      {/* Nom affiché */}
      <form
        action={nomAction}
        className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card"
      >
        <p className="text-sm font-medium text-foreground">Nom affiché</p>
        <div>
          <Label htmlFor="display_name" className="font-normal text-muted-foreground">
            Nom
          </Label>
          <Input
            id="display_name"
            name="display_name"
            type="text"
            defaultValue={nomActuel}
            className="mt-1"
          />
        </div>
        <Feedback state={nomState} />
        <Button type="submit" variant="secondary" disabled={nomPending}>
          {nomPending ? "Enregistrement…" : "Enregistrer le nom"}
        </Button>
      </form>

      {/* Mot de passe */}
      <form
        action={mdpAction}
        className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card"
      >
        <p className="text-sm font-medium text-foreground">Mot de passe</p>
        <div>
          <Label htmlFor="nouveau" className="font-normal text-muted-foreground">
            Nouveau mot de passe (8 caractères minimum)
          </Label>
          <Input
            id="nouveau"
            name="nouveau"
            type="password"
            autoComplete="new-password"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="confirmation" className="font-normal text-muted-foreground">
            Confirmer le mot de passe
          </Label>
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            className="mt-1"
          />
        </div>
        <Feedback state={mdpState} />
        <Button type="submit" variant="secondary" disabled={mdpPending}>
          {mdpPending ? "Modification…" : "Changer le mot de passe"}
        </Button>
      </form>

      {/* Adresse e-mail */}
      <form
        action={emailAction}
        className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-card"
      >
        <p className="text-sm font-medium text-foreground">Adresse de connexion</p>
        <div>
          <Label htmlFor="email" className="font-normal text-muted-foreground">
            Nouvelle adresse e-mail
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={emailActuel ?? ""}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Un e-mail de confirmation sera envoyé à la nouvelle adresse.
          </p>
        </div>
        <Feedback state={emailState} />
        <Button type="submit" variant="secondary" disabled={emailPending}>
          {emailPending ? "Envoi…" : "Changer l'adresse e-mail"}
        </Button>
      </form>
    </div>
  );
}
