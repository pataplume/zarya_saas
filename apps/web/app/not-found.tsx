import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404 global. Volontairement indistinct : une ressource hors périmètre cabinet
 * renvoie exactement la même page qu'une ressource inexistante (anti-fuite).
 */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-4xl font-bold text-slate-300" aria-hidden>
          404
        </p>
        <h1 className="mt-4 text-lg font-semibold text-foreground">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou n'est pas accessible depuis votre compte.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}
