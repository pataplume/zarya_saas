import Link from "next/link";
import { DemandeForm } from "./demande-form";

// Run D1 — page publique de demande d'accès (le compte est créé par ZARYA après contact).
export default function DemandeAccesPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← ZARYA
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          Demander un accès
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Laissez-nous vos coordonnées, notre équipe vous recontacte pour ouvrir votre accès.
        </p>
        <div className="mt-6 rounded-lg border border-border bg-card p-6 shadow-card">
          <DemandeForm />
        </div>
      </div>
    </main>
  );
}
