import Link from "next/link";
import { DemandeForm } from "./demande-form";

// Run D1 — page publique de demande d'accès (le compte est créé par ZARYA après contact).
export default function DemandeAccesPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">
          ← ZARYA
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Demander un accès</h1>
        <p className="mt-1 text-sm text-slate-500">
          Laissez-nous vos coordonnées, notre équipe vous recontacte pour ouvrir votre accès.
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <DemandeForm />
        </div>
      </div>
    </main>
  );
}
