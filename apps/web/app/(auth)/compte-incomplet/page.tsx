import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/(app)/app/actions";
import { Button } from "@/components/ui/button";

// P0-8 — Page d'erreur explicite quand la réparation automatique du provisioning
// a échoué (cf. /auth/reparer). Remplace l'ancienne boucle infinie login ↔ onboarding.
export const metadata = { title: "Compte incomplet — ZARYA" };

export default function CompteIncompletPage() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        <AlertTriangle
          className="h-6 w-6 text-amber-600"
          strokeWidth={1.75}
          role="img"
          aria-label="Erreur"
        />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Votre compte n'a pas pu être configuré
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        La création de votre espace cabinet ne s'est pas terminée correctement et la réparation
        automatique a échoué. Vos identifiants sont valides, mais votre compte doit être finalisé
        par notre équipe.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Contactez le support ZARYA en mentionnant l'email utilisé à l'inscription et l'heure de
        l'incident — nous finaliserons votre compte rapidement.
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button asChild className="w-full">
          <Link href="/auth/reparer">Réessayer</Link>
        </Button>
        <form action={logoutAction} className="w-full">
          <Button type="submit" variant="secondary" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  );
}
